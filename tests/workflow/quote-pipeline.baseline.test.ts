/**
 * Phase 0 behavioral baseline for the quote workflow refactor.
 *
 * These tests freeze the current observable behavior of the extractable
 * parts of the quote pipeline. Phases 1 and 2 must not change any of the
 * recorded outputs without an explicit update to the baseline snapshots.
 *
 * Run with:
 *   npm run test:workflow              # verify against frozen baseline
 *   npm run test:workflow:update       # regenerate baseline
 *
 * Scope:
 *  1. AI response parsing (regex currently duplicated in orchestrate_proposal
 *     and generate_quote_text) — must produce same generated_sections shape
 *     after Phase 1 extraction.
 *  2. DocuSeal submission payload (buildSubmissionPayload from contractFields)
 *     — must produce same canonicalized payload after Phase 2 centralization
 *     into createSigningSubmission.
 *  3. proposal_body extraction — the text fallback both edge functions derive
 *     from parsed sections must remain identical.
 *
 * Deliberate deviation from Codex spec: this baseline uses in-process pure
 * function tests instead of a full local-Supabase HTTP mock harness. The
 * refactor touches shared helpers, so parity at the helper level is the
 * right granularity. If a later phase changes orchestration HTTP shape,
 * we add a handler-level test at that time.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildSubmissionPayload } from "../../supabase/functions/_shared/contractFields.ts";
import { parseAnthropicSections } from "../../supabase/functions/_shared/quoteWorkflow/generateSections.ts";
import { parseAnthropicResponseCurrentBehavior } from "./helpers/parseAnthropicCurrentBehavior.ts";
import {
  canonicalizeDocuSealPayload,
  extractShape,
} from "./helpers/canonicalize.ts";

const FIXTURES = resolve(__dirname, "fixtures");
const BASELINE = resolve(__dirname, "baseline");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURES, name), "utf-8");
}

function loadJsonFixture<T>(name: string): T {
  return JSON.parse(loadFixture(name)) as T;
}

describe("Phase 0 baseline: AI response parsing", () => {
  const rawAnthropicResponse = loadFixture("anthropic-response.txt");

  it("parses fixture into generated_sections with stable shape", async () => {
    const result = parseAnthropicResponseCurrentBehavior(rawAnthropicResponse);

    expect(result.generatedSections).not.toBeNull();

    const shape = extractShape(result.generatedSections);
    await expect(JSON.stringify(shape, null, 2)).toMatchFileSnapshot(
      resolve(BASELINE, "generated-sections.shape.json"),
    );
  });

  it("extracts proposal_body as plain text fallback", async () => {
    const result = parseAnthropicResponseCurrentBehavior(rawAnthropicResponse);

    expect(result.generatedText).not.toBe(rawAnthropicResponse);
    expect(result.generatedText.length).toBeGreaterThan(100);
    await expect(result.generatedText).toMatchFileSnapshot(
      resolve(BASELINE, "proposal-body.txt"),
    );
  });

  it("returns null sections when JSON block is absent", () => {
    const result = parseAnthropicResponseCurrentBehavior(
      "Bara fri text utan JSON-struktur alls.",
    );
    expect(result.generatedSections).toBeNull();
    expect(result.generatedText).toBe("Bara fri text utan JSON-struktur alls.");
  });

  it("returns null sections when JSON is malformed", () => {
    const malformed =
      'Texten innehåller { "summary_pitch": "x", "proposal_body": broken }';
    const result = parseAnthropicResponseCurrentBehavior(malformed);
    expect(result.generatedSections).toBeNull();
    expect(result.generatedText).toBe(malformed);
  });
});

describe("Phase 1 parity: extracted parseAnthropicSections matches legacy", () => {
  const rawAnthropicResponse = loadFixture("anthropic-response.txt");

  it("extracted helper produces identical sections for fixture", () => {
    const legacy = parseAnthropicResponseCurrentBehavior(rawAnthropicResponse);
    const extracted = parseAnthropicSections(rawAnthropicResponse);

    expect(extracted.generatedSections).toEqual(legacy.generatedSections);
    expect(extracted.generatedText).toBe(legacy.generatedText);
  });

  it("extracted helper produces null for plain text input", () => {
    const raw = "Bara fri text utan JSON-struktur alls.";
    const legacy = parseAnthropicResponseCurrentBehavior(raw);
    const extracted = parseAnthropicSections(raw);

    expect(extracted.generatedSections).toBeNull();
    expect(extracted.generatedSections).toEqual(legacy.generatedSections);
    expect(extracted.generatedText).toBe(legacy.generatedText);
  });

  it("extracted helper falls back to raw text on malformed JSON", () => {
    const malformed =
      'Texten innehåller { "summary_pitch": "x", "proposal_body": broken }';
    const legacy = parseAnthropicResponseCurrentBehavior(malformed);
    const extracted = parseAnthropicSections(malformed);

    expect(extracted.generatedSections).toBeNull();
    expect(extracted.generatedSections).toEqual(legacy.generatedSections);
    expect(extracted.generatedText).toBe(legacy.generatedText);
  });
});

describe("Phase 0 baseline: DocuSeal submission payload", () => {
  type ContractInputFixture = Parameters<typeof buildSubmissionPayload>[0];

  it("builds payload from canonical quote fixture", async () => {
    const input = loadJsonFixture<ContractInputFixture>("contract-input.json");
    const payload = buildSubmissionPayload(input);
    const canonical = canonicalizeDocuSealPayload(payload);

    await expect(JSON.stringify(canonical, null, 2)).toMatchFileSnapshot(
      resolve(BASELINE, "docuseal-payload.json"),
    );
  });

  it("preserves submitter order (Axona Digital AB first, First Party second)", () => {
    const input = loadJsonFixture<ContractInputFixture>("contract-input.json");
    const payload = buildSubmissionPayload(input);

    expect(payload.submitters).toHaveLength(2);
    expect(payload.submitters[0].role).toBe("Axona Digital AB");
    expect(payload.submitters[1].role).toBe("First Party");
  });

  it("never sets send_email=true on submitters (we send via Resend ourselves)", () => {
    const input = loadJsonFixture<ContractInputFixture>("contract-input.json");
    const payload = buildSubmissionPayload(input);

    expect(payload.send_email).toBe(false);
    for (const submitter of payload.submitters) {
      expect(submitter.send_email).toBe(false);
    }
  });

  it("includes proposal link field when proposalUrl is provided", () => {
    const input = loadJsonFixture<ContractInputFixture>("contract-input.json");
    const payload = buildSubmissionPayload(input);
    const clientFields = payload.submitters[1].fields;
    const proposalLink = clientFields.find((f) => f.name === "Offertlänk");

    expect(proposalLink).toBeDefined();
    expect(proposalLink?.default_value).toContain("quote.html");
  });

  it("omits proposal link field when proposalUrl is absent", () => {
    const input = loadJsonFixture<ContractInputFixture>("contract-input.json");
    const withoutUrl = { ...input, proposalUrl: undefined };
    const payload = buildSubmissionPayload(withoutUrl);
    const clientFields = payload.submitters[1].fields;

    expect(clientFields.find((f) => f.name === "Offertlänk")).toBeUndefined();
  });
});
