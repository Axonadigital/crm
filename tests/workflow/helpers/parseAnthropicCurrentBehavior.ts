/**
 * Replicates the exact inline AI-response parsing currently duplicated in
 * `orchestrate_proposal/index.ts` and `generate_quote_text/index.ts`.
 *
 * This file is the Phase 0 reference for what "current behavior" means.
 * Phase 1 extracts this logic to `_shared/quoteWorkflow/generateSections.ts`
 * under the name `parseAnthropicSections`. The baseline test asserts that
 * the extracted function matches this reference byte-for-byte against the
 * same fixture input.
 *
 * Do not change this function — it is a frozen snapshot of current code.
 * If current code changes, regenerate the baseline first.
 */

export interface CurrentParseResult {
  rawText: string;
  generatedSections: Record<string, unknown> | null;
  generatedText: string;
}

export function parseAnthropicResponseCurrentBehavior(
  rawText: string,
): CurrentParseResult {
  let generatedSections: Record<string, unknown> | null = null;
  let generatedText = rawText;

  try {
    const jsonMatch = rawText.match(
      /\{[\s\S]*"summary_pitch"[\s\S]*"proposal_body"[\s\S]*\}/,
    );
    if (jsonMatch) {
      generatedSections = JSON.parse(jsonMatch[0]);
      const body = (generatedSections as { proposal_body?: string })
        .proposal_body;
      if (body) {
        generatedText = body;
      }
    }
  } catch {
    generatedSections = null;
  }

  return { rawText, generatedSections, generatedText };
}
