import { describe, expect, it } from "vitest";
import {
  buildCallLogsContext,
  buildEmailContext,
  buildEnrichmentContext,
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
        call_duration_seconds: 420,
      },
    ]);

    expect(context).toContain("FRÅN SAMTALSLOGGAR");
    expect(context).toContain("Sammanfattning:");
    expect(context).toContain("1 samtal totalt");
    expect(context).toContain("Återkom senare");
    expect(context).toContain("Samtalslängd: 7 min");
    expect(context).toContain("tydligare upplägg");
    expect(context).toContain("intern avstämning");
    expect(context).toContain("Planerad uppföljning");
  });

  it("low-value outcomes are summarized but not listed individually", () => {
    const context = buildCallLogsContext([
      { created_at: "2026-04-01T10:00:00.000Z", call_outcome: "no_answer" },
      { created_at: "2026-04-02T10:00:00.000Z", call_outcome: "busy" },
      { created_at: "2026-04-03T10:00:00.000Z", call_outcome: "no_answer" },
      {
        created_at: "2026-04-04T10:00:00.000Z",
        call_outcome: "interested",
        notes: "Kunden är genuint intresserad av AI-lösningar",
      },
    ]);

    expect(context).toContain("4 samtal totalt");
    expect(context).toContain("3 utan svar");
    expect(context).toContain("1 visade intresse");
    expect(context).toContain("AI-lösningar");
    expect(context).not.toContain("Ingen svarade");
    expect(context).not.toContain("Upptagen");
  });

  it("shows call duration in detailed entry", () => {
    const context = buildCallLogsContext([
      {
        created_at: "2026-04-08T10:00:00.000Z",
        call_outcome: "spoke_decision_maker",
        notes: "Diskuterade budget och tidplan",
        call_duration_seconds: 900,
      },
    ]);

    expect(context).toContain("Samtalslängd: 15 min");
  });

  it("omits duration line when call_duration_seconds is null", () => {
    const context = buildCallLogsContext([
      {
        created_at: "2026-04-08T10:00:00.000Z",
        call_outcome: "interested",
        call_duration_seconds: null,
      },
    ]);

    expect(context).not.toContain("Samtalslängd");
  });

  it("limits detailed entries to 5 even with more high-value logs", () => {
    const logs = Array.from({ length: 7 }, (_, i) => ({
      created_at: `2026-04-0${i + 1}T10:00:00.000Z`,
      call_outcome: "interested",
      notes: `Samtal ${i + 1}`,
    }));

    const context = buildCallLogsContext(logs);
    const entryCount = (context.match(/^- /gm) || []).length;
    expect(entryCount).toBeLessThanOrEqual(5);
  });

  it("returns empty context strings when data is missing", () => {
    expect(buildMeetingContext(null)).toBe("");
    expect(buildCallLogsContext([])).toBe("");
    expect(buildEmailContext([])).toBe("");
  });

  it("returns empty string for null/undefined enrichment input", () => {
    expect(buildEnrichmentContext(null)).toBe("");
    expect(buildEnrichmentContext(undefined)).toBe("");
  });

  it("returns empty string when company object has all null fields", () => {
    expect(
      buildEnrichmentContext({
        lead_score: null,
        segment: null,
        has_facebook: null,
        facebook_url: null,
        has_instagram: null,
        instagram_url: null,
        website_score: null,
      }),
    ).toBe("");
  });

  it("includes lead score and segment in enrichment context", () => {
    const context = buildEnrichmentContext({
      lead_score: 75,
      segment: "SME",
    });
    expect(context).toContain("Lead score: 75/100");
    expect(context).toContain("Segment: SME");
    expect(context).toContain("Digital närvaro:");
  });

  it("includes Facebook when has_facebook and facebook_url are set", () => {
    const context = buildEnrichmentContext({
      has_facebook: true,
      facebook_url: "https://facebook.com/acme",
    });
    expect(context).toContain("Facebook: aktiv (https://facebook.com/acme)");
  });

  it("excludes Facebook when has_facebook is true but url is missing", () => {
    const context = buildEnrichmentContext({
      has_facebook: true,
      facebook_url: null,
    });
    expect(context).not.toContain("Facebook");
  });

  it("includes Instagram when has_instagram and instagram_url are set", () => {
    const context = buildEnrichmentContext({
      has_instagram: true,
      instagram_url: "https://instagram.com/acme",
    });
    expect(context).toContain("Instagram: aktiv (https://instagram.com/acme)");
  });

  it("maps website_score 0 to 'ingen hemsida'", () => {
    const context = buildEnrichmentContext({ website_score: 0 });
    expect(context).toContain("ingen hemsida");
    expect(context).toContain("score 0/100");
  });

  it("maps website_score 39 to 'dålig hemsida'", () => {
    const context = buildEnrichmentContext({ website_score: 39 });
    expect(context).toContain("dålig hemsida");
  });

  it("maps website_score 55 to 'ok hemsida'", () => {
    const context = buildEnrichmentContext({ website_score: 55 });
    expect(context).toContain("ok hemsida");
  });

  it("maps website_score 85 to 'bra hemsida'", () => {
    const context = buildEnrichmentContext({ website_score: 85 });
    expect(context).toContain("bra hemsida");
  });

  it("formats a single email with subject, status and date", () => {
    const context = buildEmailContext([
      {
        subject: "Offertförslag",
        status: "sent",
        sent_at: "2026-04-07T12:00:00.000Z",
      },
    ]);
    expect(context).toContain("SENASTE E-POSTKOMMUNIKATION");
    expect(context).toContain('"Offertförslag"');
    expect(context).toContain("sent");
    expect(context).toContain("2026-04-07");
  });

  it("formats multiple emails", () => {
    const context = buildEmailContext([
      { subject: "Email 1", status: "sent", sent_at: "2026-04-01T10:00:00Z" },
      {
        subject: "Email 2",
        status: "delivered",
        sent_at: "2026-04-02T10:00:00Z",
      },
    ]);
    expect(context).toContain('"Email 1"');
    expect(context).toContain('"Email 2"');
  });

  it("shows 'ej skickat' when sent_at is null", () => {
    const context = buildEmailContext([
      { subject: "Draft", status: "draft", sent_at: null },
    ]);
    expect(context).toContain("ej skickat");
  });

  it("returns empty string for null and undefined email input", () => {
    expect(buildEmailContext(null)).toBe("");
    expect(buildEmailContext(undefined)).toBe("");
  });

  it("builds prompts that include call logs and personalization guidance", () => {
    const { prompt, systemPrompt } = buildQuoteGenerationPrompts({
      companyName: "Kundbolaget",
      contactName: "Anna",
      sector: "Bygg",
      industry: "Entreprenad",
      companyDescription: "Bygger och renoverar åt företag och privatpersoner.",
      enrichmentContext:
        "\nDigital närvaro: Hemsida: ok hemsida (score 55/100)",
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
    expect(prompt).toContain("TOLKA SAMTALSLOGGAR");
    expect(systemPrompt).toContain("samtalsloggar");
    expect(systemPrompt).toContain("skriven för just den kunden");
    expect(systemPrompt).toContain("engagemangsnivå");
  });
});
