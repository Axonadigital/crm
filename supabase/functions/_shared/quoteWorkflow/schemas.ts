/**
 * Shared types for the quote workflow pipeline.
 *
 * Phase 1 scope: describes the shape of AI-generated section output and the
 * input/output of the shared generateSections helper. Intentionally uses
 * plain TypeScript types rather than runtime validators — phase 1 preserves
 * current fallback-on-failure behavior, so adding hard validation now would
 * change observable behavior.
 *
 * Phase 3 will introduce Zod schemas with per-boundary fail/quarantine
 * policies. Until then, these types are documentation plus the contract the
 * edge functions consume.
 */

/**
 * Raw shape the current regex-based parser expects to find in the Anthropic
 * response. Any additional keys are preserved verbatim.
 */
export interface ParsedAnthropicSections {
  summary_pitch: unknown;
  proposal_body: unknown;
  [key: string]: unknown;
}

/**
 * Input to the shared `generateSections` helper.
 *
 * Prompt and systemPrompt are built by the existing
 * `buildQuoteGenerationPrompts` helper in `_shared/quoteGeneration.ts` —
 * phase 1 keeps that split because each edge function fetches its own
 * context shape before prompt construction.
 */
export interface GenerateSectionsInput {
  prompt: string;
  systemPrompt: string;
  apiKey: string;
  /** Optional fetch override for testing. */
  fetchImpl?: typeof fetch;
}

/**
 * Result returned by `generateSections`. Mirrors the current inline behavior
 * in both orchestrate_proposal and generate_quote_text:
 *  - rawText is always the full Anthropic message body text
 *  - generatedSections is the parsed JSON object or null if no match / malformed
 *  - generatedText is proposal_body when sections parsed successfully, otherwise rawText
 */
export interface GenerateSectionsResult {
  rawText: string;
  generatedSections: Record<string, unknown> | null;
  generatedText: string;
}
