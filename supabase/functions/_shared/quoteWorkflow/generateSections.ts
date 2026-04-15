/**
 * Shared AI section generation for the quote workflow.
 *
 * Phase 1 extraction — this file is now the ONLY place in the codebase
 * that calls the Anthropic Messages API for quote generation and the ONLY
 * place that parses the response. Both `orchestrate_proposal` and
 * `generate_quote_text` delegate here.
 *
 * Behavioral requirements (verified by tests/workflow baseline):
 *  - Must use the same Anthropic model, max_tokens and headers as before
 *  - Must use the same regex to locate the JSON block inside the response
 *  - Must fall back silently to null generatedSections on parse failure
 *  - Must return proposal_body as generatedText when parse succeeds,
 *    otherwise return rawText unchanged
 */

import { getAnthropicApiUrl } from "../serviceEndpoints.ts";
import type {
  GenerateSectionsInput,
  GenerateSectionsResult,
} from "./schemas.ts";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const ANTHROPIC_MAX_TOKENS = 3000;
const ANTHROPIC_API_VERSION = "2023-06-01";

/**
 * Parse a raw Anthropic response text into structured sections. This is a
 * direct extraction of the regex previously duplicated in both edge
 * functions — it must match the frozen behavior recorded in
 * tests/workflow/baseline/generated-sections.shape.json.
 *
 * Returns generatedSections=null when no JSON block is found or parsing
 * fails. generatedText is proposal_body when sections were parsed and the
 * body string is non-empty, otherwise rawText unchanged.
 */
export function parseAnthropicSections(rawText: string): {
  generatedSections: Record<string, unknown> | null;
  generatedText: string;
} {
  let generatedSections: Record<string, unknown> | null = null;
  let generatedText = rawText;

  try {
    const jsonMatch = rawText.match(
      /\{[\s\S]*"summary_pitch"[\s\S]*"proposal_body"[\s\S]*\}/,
    );
    if (jsonMatch) {
      generatedSections = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const body = (generatedSections as { proposal_body?: string })
        .proposal_body;
      if (body) {
        generatedText = body;
      }
    }
  } catch (parseError) {
    // Preserve legacy behavior: log and fall back to raw text.
    console.warn(
      "parseAnthropicSections: JSON parse failed, falling back to plain text:",
      parseError,
    );
    generatedSections = null;
    generatedText = rawText;
  }

  return { generatedSections, generatedText };
}

/**
 * Call Anthropic with the given prompt pair and return parsed sections.
 * Throws on HTTP failure; callers decide how to surface errors to the user.
 */
export async function generateSections(
  input: GenerateSectionsInput,
): Promise<GenerateSectionsResult> {
  const fetchImpl = input.fetchImpl ?? fetch;

  const response = await fetchImpl(getAnthropicApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      messages: [{ role: "user", content: input.prompt }],
      system: input.systemPrompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", errorText);
    throw new Error(`Anthropic API request failed: ${response.status}`);
  }

  const result = (await response.json()) as {
    content?: Array<{ text?: string }>;
  };
  const rawText = result.content?.[0]?.text || "Failed to generate text";

  const { generatedSections, generatedText } = parseAnthropicSections(rawText);

  return { rawText, generatedSections, generatedText };
}
