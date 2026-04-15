/**
 * Canonicalization helpers for workflow baseline tests.
 *
 * Baseline snapshots must be stable across test runs, so dynamic values
 * (timestamps, ids, tokens) are replaced with placeholders before
 * comparison. These helpers are the single source of truth for what
 * "structurally equal" means in the Phase 0 baseline.
 */

import { createHash } from "node:crypto";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

/**
 * Extract the structural shape of a value: keys and types only, no concrete
 * values. Used to assert that AI output structure is preserved across the
 * refactor even though the literal text varies between runs.
 *
 * - objects: sorted keys, recursive
 * - arrays: shape of first element, or [] if empty
 * - scalars: replaced with type marker ("string", "number", "boolean", "null")
 */
export function extractShape(value: unknown): unknown {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return value.length > 0 ? [extractShape(value[0])] : [];
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = extractShape((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return typeof value;
}

/**
 * Canonicalize a DocuSeal submission payload by replacing dynamic dates
 * with placeholders. The payload's structure and non-date fields must
 * remain stable across Phase 1 and Phase 2.
 */
export function canonicalizeDocuSealPayload(payload: unknown): JsonValue {
  const cloned = JSON.parse(JSON.stringify(payload)) as JsonValue;
  return walkAndReplace(cloned, (value) => {
    if (typeof value !== "string") return value;
    // Swedish date format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "__DATE__";
    // ISO timestamp
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return "__TIMESTAMP__";
    }
    // Proposal URL with dynamic id/token
    if (/^https?:\/\/[^\s]+\/quote\.html/.test(value)) {
      return "__PROPOSAL_URL__";
    }
    return value;
  });
}

/**
 * Canonicalize an HTML string by replacing write token, approval token,
 * and rendered dates with placeholders, then return a sha256 hash.
 * Used to detect HTML drift across refactor phases without storing
 * full HTML diffs in the repo.
 */
export function canonicalizeHtml(html: string): string {
  const canonical = html
    .replace(
      /window\.QUOTE_WRITE_TOKEN\s*=\s*['"][^'"]*['"]/g,
      'window.QUOTE_WRITE_TOKEN="__TOKEN__"',
    )
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "__DATE__")
    .replace(/\s+/g, " ")
    .trim();
  return sha256(canonical);
}

/** SHA-256 hash of a string, lowercased hex. */
export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function walkAndReplace(
  value: JsonValue,
  replacer: (v: JsonValue) => JsonValue,
): JsonValue {
  const replaced = replacer(value);
  if (Array.isArray(replaced)) {
    return replaced.map((v) => walkAndReplace(v, replacer));
  }
  if (replaced !== null && typeof replaced === "object") {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(replaced).sort()) {
      out[key] = walkAndReplace(replaced[key], replacer);
    }
    return out;
  }
  return replaced;
}
