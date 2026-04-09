import { describe, expect, it } from "vitest";
import {
  buildCallLogsContext,
  buildEmailContext,
  buildMeetingContext,
  buildQuoteGenerationPrompts,
} from "./quoteGeneration.ts";

describe("quoteGeneration helpers", () => {
  it("builds meeting context from analysis fields", () => {
    const context = buildMeetingContext({
      summary: "Kunden vill förbättra sin webbplats.",
      customer_needs: ["Fler leads", "Tydligare erbjudande"],
      objections: ["Osäker på tidsplan"],
      quote_context: {
        budget_mentioned: "80 000 kr",
        timeline: "Maj",
      },
    });

    expect(context).toContain("FRÅN SENASTE MÖTET");
    expect(context).toContain("Kunden vill förbättra sin webbplats.");
    expect(context).toContain("Fler leads, Tydligare erbjudande");
    expect(context).toContain("Osäker på tidsplan");
    expect(context).toContain("80 000 kr");
    expect(context).toContain("Maj");
  });

  it("builds call log context with outcome, note and follow-up", () => {
    const context = buildCallLogsContext([
      {
        created_at: "2026-04-08T10:00:00.000Z",
        call_outcome: "callback_requested",
        notes: "Kunden vill se ett tydligare upplägg för innehåll och SEO.",
        followup_note: "Återkom efter intern avstämning",
        followup_date: "2026-04-12T09:00:00.000Z",
      },
    ]);

    expect(context).toContain("FRÅN SAMTALSLOGGAR");
    expect(context).toContain("Återkom senare");
    expect(context).toContain("tydligare upplägg");
    expect(context).toContain("intern avstämning");
    expect(context).toContain("Planerad uppföljning");
  });

  it("returns empty context strings when data is missing", () => {
    expect(buildMeetingContext(null)).toBe("");
    expect(buildCallLogsContext([])).toBe("");
    expect(buildEmailContext([])).toBe("");
  });

  it("builds prompts that include call logs and personalization guidance", () => {
    const { prompt, systemPrompt } = buildQuoteGenerationPrompts({
      companyName: "Kundbolaget",
      contactName: "Anna",
      sector: "Bygg",
      industry: "Entreprenad",
      companyDescription: "Bygger och renoverar åt företag och privatpersoner.",
      enrichmentContext: "\nDigital närvaro: Hemsida: ok hemsida (score 55/100)",
      quoteTitle: "Ny hemsida",
      isWebProject: true,
      lineItemsText: "- Ny hemsida: 1 x 50000 SEK = 50000 SEK",
      meetingContext:
        "\n\nFRÅN SENASTE MÖTET:\nMötessammanfattning: Kunden vill ha fler inbound-förfrågningar.",
      callLogsContext:
        "\n\nFRÅN SAMTALSLOGGAR:\n- 2026-04-08: Återkom senare | Anteckning: Beslutsfattaren ville se mer konkreta exempel.",
      emailContext:
        '\n\nSENASTE E-POSTKOMMUNIKATION:\n- "Tack för mötet" (sent, 2026-04-07)',
      kbTemplate: "",
    });

    expect(prompt).toContain("FRÅN SAMTALSLOGGAR");
    expect(prompt).toContain("problem_cards");
    expect(prompt).toContain("package_includes");
    expect(prompt).toContain("Undvik generiska formuleringar");
    expect(systemPrompt).toContain("samtalsloggar");
    expect(systemPrompt).toContain("skriven för just den kunden");
  });
});
