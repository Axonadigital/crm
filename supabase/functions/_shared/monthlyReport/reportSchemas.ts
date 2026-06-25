/**
 * Zod-schema för AI-genererat månadsrapport-innehåll.
 *
 * Speglar mönstret i quoteWorkflow/schemas.ts. Validering sker i
 * generateReportContent.ts; vid miss → quarantine (DB + Discord) och rapporten
 * markeras 'failed' i stället för att skicka ett halvfärdigt mail.
 *
 * Runtime-import: `npm:zod@4` (fungerar i Deno + aliasas i vitest.functions.config.ts).
 */

import { z } from "npm:zod@4";

/** En post i den handlingsdrivna åtgärdsplanen (knyts till finding via `key`). */
export const reportActionItemSchema = z
  .object({
    key: z.string().min(1),
    what_we_see: z.string().min(1),
    what_it_means: z.string().min(1),
    how_we_help: z.string().min(1),
    next_step: z.string().min(1),
  })
  .strict();

export const monthlyReportContentSchema = z
  .object({
    /** Hälsningsfras, t.ex. "Hej Anna," */
    greeting: z.string().min(1),
    /** 1–2 meningar om månadens utveckling, kundvänt. */
    summary: z.string().min(1),
    /** Exakt EN rekommenderad åtgärd, kopplad till den valda upsellen. */
    recommended_action: z.string().min(1),
    /** Motivering för den föreslagna tjänsten (utan pris). */
    upsell_pitch: z.string().min(1),
    /**
     * Handlingsdriven åtgärdsplan, 1–3 poster (en per prioriterad finding).
     * Mejlet och PDF:en leder med post 0.
     */
    action_plan: z.array(reportActionItemSchema).min(1).max(3),
  })
  .strict();

export type MonthlyReportContent = z.infer<typeof monthlyReportContentSchema>;
