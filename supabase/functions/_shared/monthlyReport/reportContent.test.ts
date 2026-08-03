import { describe, expect, it } from "vitest";
import { monthlyReportContentSchema } from "./reportSchemas.ts";
import { buildMonthlyReportPrompts } from "./buildReportPrompt.ts";
import {
  buildReportEmailHtml,
  CUSTOMER_HIDDEN_FINDING_KEYS,
} from "./buildReportEmailHtml.ts";
import { computeReportMetrics } from "./computeReportMetrics.ts";
import { parseReportContent } from "./generateReportContent.ts";
import { DEFAULT_PRESENTATION } from "./reportPresentation.ts";
import type { ReportSnapshot, ReportViewModel } from "./types.ts";

const snap: ReportSnapshot = {
  performance_score: 81,
  pagespeed: { lcp_ms: 5100, cls: 0 },
  search_console: {
    clicks: 23,
    impressions: 121,
    position: 6.8,
    top_queries: [
      { query: "jvs maskiner", clicks: 10, impressions: 40, position: 1.2 },
    ],
    top_pages: [
      {
        page: "https://jvsmaskiner.se/service",
        clicks: 8,
        impressions: 70,
        ctr: 8 / 70,
        position: 5.4,
      },
    ],
    branded: { clicks: 18, impressions: 80, queries: 2 },
    non_branded: { clicks: 5, impressions: 41, queries: 12 },
    opportunities: [
      {
        kind: "position_4_10",
        query: "entreprenadmaskiner service",
        clicks: 2,
        impressions: 50,
        ctr: 0.04,
        position: 7.2,
      },
    ],
  },
};

describe("monthlyReportContentSchema", () => {
  it("accepts a well-formed AI payload", () => {
    const ok = monthlyReportContentSchema.safeParse({
      greeting: "Hej Anna,",
      summary: "Bra månad.",
      recommended_action: "Vi föreslår SEO.",
      upsell_pitch: "Det lyfter er.",
      action_plan: [
        {
          key: "low_position",
          what_we_see: "Snittposition 18.",
          what_it_means: "Utanför första sidan.",
          how_we_help: "Vi optimerar med SEO-optimering.",
          next_step: "Hör av er så börjar vi.",
        },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a payload that is missing action_plan", () => {
    expect(
      monthlyReportContentSchema.safeParse({
        greeting: "Hej Anna,",
        summary: "Bra månad.",
        recommended_action: "Vi föreslår SEO.",
        upsell_pitch: "Det lyfter er.",
      }).success,
    ).toBe(false);
  });

  it("rejects missing fields and unknown keys", () => {
    expect(
      monthlyReportContentSchema.safeParse({ greeting: "Hej" }).success,
    ).toBe(false);
    expect(
      monthlyReportContentSchema.safeParse({
        greeting: "Hej",
        summary: "x",
        recommended_action: "y",
        upsell_pitch: "z",
        extra: "nope",
      }).success,
    ).toBe(false);
  });
});

describe("parseReportContent", () => {
  it("extracts the JSON object from a chatty AI response", () => {
    const raw =
      'Här kommer mailet:\n{"greeting":"Hej Anna,","summary":"Bra.","recommended_action":"SEO.","upsell_pitch":"Nära."}\nHoppas det passar!';
    expect(parseReportContent(raw)).toEqual({
      greeting: "Hej Anna,",
      summary: "Bra.",
      recommended_action: "SEO.",
      upsell_pitch: "Nära.",
    });
  });

  it("returns null when no JSON block is present", () => {
    expect(parseReportContent("ingen json här")).toBeNull();
  });
});

describe("buildMonthlyReportPrompts", () => {
  it("includes metrics, upsell pitch, and the no-price rule", () => {
    const metrics = computeReportMetrics(snap, null);
    const { prompt, systemPrompt } = buildMonthlyReportPrompts({
      companyName: "JVS Maskiner AB",
      contactName: "Anna Andersson",
      periodLabel: "juni 2026",
      metrics,
      upsell: {
        service: "SEO-optimering",
        label: "SEO-optimering",
        description: "Nära förstasidan.",
        pitch: "Ett kliv kvar.",
      },
      recommendations: [
        {
          key: "low_position",
          severity: "medium",
          title: "Nära första sidan",
          description: "Flera sökord ligger precis utanför topp 10.",
          service: "SEO-optimering",
        },
      ],
      geoReadiness: "Strukturerad data finns.",
      hasSearchData: true,
      presentation: DEFAULT_PRESENTATION,
    });
    expect(prompt).toContain("JVS Maskiner AB");
    expect(prompt).toContain("Klick från Google: 23");
    expect(prompt).toContain("SEO-optimering");
    expect(prompt).toContain("key: low_position");
    expect(prompt).toContain("Viktigaste landningssidor");
    expect(prompt).toContain("https://jvsmaskiner.se/service");
    expect(prompt).toContain("Konkreta sökmöjligheter");
    expect(prompt).toContain("entreprenadmaskiner service");
    expect(prompt).toContain("Varumärke vs upptäckt");
    expect(systemPrompt).toContain("Nämn ALDRIG pris");
    expect(systemPrompt).toContain("Börja sammanfattningen");
    expect(systemPrompt).toContain("action_plan");
    expect(prompt).toContain("börja med det positiva");
    expect(prompt).toContain("mot förra månaden");
  });

  it("uses the given comparisonLabel instead of 'förra månaden' for multi-month periods", () => {
    // Regression: en flermånadersrapport (t.ex. juni–juli) jämförs mot en
    // lika lång föregående period (april–maj), inte "förra månaden" — AI:n
    // skrev annars ut fel jämförelse i kundtexten.
    const metrics = computeReportMetrics(snap, null);
    const { prompt } = buildMonthlyReportPrompts({
      companyName: "JVS Maskiner AB",
      contactName: "Anna Andersson",
      periodLabel: "juni – juli 2026",
      metrics,
      upsell: null,
      recommendations: [],
      geoReadiness: "Strukturerad data finns.",
      hasSearchData: true,
      presentation: DEFAULT_PRESENTATION,
      comparisonLabel: "perioden innan (april–maj)",
    });
    expect(prompt).toContain("mot perioden innan (april–maj)");
    expect(prompt).not.toContain("mot förra månaden");
  });

  it("includes the per-month breakdown so AI can honestly flag a within-period decline", () => {
    // Regression: aggregatet kan vara upp mot jämförelseperioden men ändå
    // falla inom sig själv (juli lägre än juni) — utan denna rad hade AI:n
    // bara sett "+294 %" och inte kunnat nämna nedgången ärligt.
    const metrics = {
      ...computeReportMetrics(snap, null),
      monthlySeries: [
        { month: "2026-06", clicks: 40, impressions: 1114 },
        { month: "2026-07", clicks: 23, impressions: 628 },
      ],
    };
    const { prompt } = buildMonthlyReportPrompts({
      companyName: "JVS Maskiner AB",
      contactName: "Anna Andersson",
      periodLabel: "juni – juli 2026",
      metrics,
      upsell: null,
      recommendations: [],
      geoReadiness: "Strukturerad data finns.",
      hasSearchData: true,
      presentation: DEFAULT_PRESENTATION,
      comparisonLabel: "perioden innan (april–maj)",
    });
    expect(prompt).toContain("Utveckling per månad i perioden");
    expect(prompt).toContain("juni: 40 klick/1114 visningar");
    expect(prompt).toContain("juli: 23 klick/628 visningar");
    expect(prompt).toContain("nämn det ärligt");
  });

  it("orders priorities by the explicitly selected upsell service", () => {
    const metrics = computeReportMetrics(snap, null);
    const { prompt } = buildMonthlyReportPrompts({
      companyName: "Axona Digital AB",
      contactName: null,
      periodLabel: "juni 2026",
      metrics,
      upsell: {
        service: "SEO-optimering",
        label: "SEO-optimering",
        description: "Ni börjar synas på Google.",
        pitch: "Vi lyfter viktiga sökord.",
      },
      recommendations: [
        {
          key: "missing_business_profile",
          severity: "high",
          title: "Google Business saknas",
          description: "Ni syns inte i lokala kartresultat.",
          service: "Google Business-paket",
        },
        {
          key: "low_position",
          severity: "medium",
          title: "Nära första sidan",
          description: "Flera sökord ligger precis utanför topp 10.",
          service: "SEO-optimering",
        },
      ],
      geoReadiness: "Strukturerad data finns.",
      hasSearchData: true,
      presentation: DEFAULT_PRESENTATION,
    });

    expect(prompt).toContain("Föreslagen tjänst att rekommendera");
    expect(prompt).toContain("Tjänst: SEO-optimering");
    expect(prompt.indexOf("key: low_position")).toBeLessThan(
      prompt.indexOf("key: missing_business_profile"),
    );
  });

  it("adds the selected upsell as first priority when stats have no matching finding", () => {
    const metrics = computeReportMetrics(snap, null);
    const { prompt } = buildMonthlyReportPrompts({
      companyName: "Axona Digital AB",
      contactName: null,
      periodLabel: "juni 2026",
      metrics,
      upsell: {
        service: "SEO-optimering",
        label: "SEO-optimering",
        description: "Ni börjar synas på Google.",
        pitch: "Vi lyfter viktiga sökord.",
      },
      recommendations: [
        {
          key: "missing_business_profile",
          severity: "high",
          title: "Google Business saknas",
          description: "Ni syns inte i lokala kartresultat.",
          service: "Google Business-paket",
        },
      ],
      geoReadiness: "Strukturerad data finns.",
      hasSearchData: true,
      presentation: DEFAULT_PRESENTATION,
    });

    expect(prompt.indexOf("key: selected_recommended_service")).toBeLessThan(
      prompt.indexOf("key: missing_business_profile"),
    );
    expect(prompt).toContain("Tjänst: SEO-optimering");
  });

  it("tells the model to skip search metrics when there is no GSC data", () => {
    const metrics = computeReportMetrics({ performance_score: 80 }, null);
    const { prompt } = buildMonthlyReportPrompts({
      companyName: "X",
      contactName: null,
      periodLabel: "juni 2026",
      metrics,
      upsell: null,
      recommendations: [],
      geoReadiness: "ok",
      hasSearchData: false,
      presentation: DEFAULT_PRESENTATION,
    });
    expect(prompt).toContain("Sökdata (Google Search Console) saknas");
  });

  it("hides raw Axona-owned numbers and feeds opportunity lines when policy suppresses them", () => {
    // Svag kund: prestanda 45, laddtid 6,1 s. Policy ska dölja råtalen.
    const weakSnap: ReportSnapshot = {
      performance_score: 45,
      pagespeed: { lcp_ms: 6100, cls: 0 },
      search_console: {
        clicks: 5,
        impressions: 300,
        position: 34.7,
        top_queries: [],
      },
    };
    const metrics = computeReportMetrics(weakSnap, null);
    const weakPresentation = {
      ...DEFAULT_PRESENTATION,
      tone: "reassure" as const,
      showPerformanceScore: false,
      showLcp: false,
      showPositionAbsolute: false,
    };
    const { prompt } = buildMonthlyReportPrompts({
      companyName: "Svag Kund AB",
      contactName: null,
      periodLabel: "maj 2026",
      metrics,
      upsell: null,
      recommendations: [],
      geoReadiness: "ok",
      hasSearchData: true,
      presentation: weakPresentation,
    });
    // Inga råa, svaga Axona-ägda tal i prompten.
    expect(prompt).not.toContain("Hastighetspoäng (mobil, 0–100): 45");
    expect(prompt).not.toContain("6.1");
    expect(prompt).not.toContain("34.7");
    // Istället sifferlösa möjlighets-rader + ton.
    expect(prompt).toContain("Prestanda: utvecklingsmöjlighet");
    expect(prompt).toContain("Laddtid: utvecklingsmöjlighet");
    expect(prompt).toContain("TON:");
  });
});

describe("buildReportEmailHtml", () => {
  const aiContent = {
    greeting: "Hej Anna,",
    summary: "Stabil månad med fler visningar.",
    recommended_action: "Vi föreslår en SEO-insats.",
    upsell_pitch: "Ni är nära förstasidan.",
  };

  it("renders metric rows and the recommended action", () => {
    const metrics = computeReportMetrics(snap, {
      search_console: {
        clicks: 20,
        impressions: 100,
        position: 8,
        top_queries: [],
      },
    });
    const viewModel: ReportViewModel = {
      version: 2,
      companyName: "JVS Maskiner AB",
      period: { start: "2026-06-01", end: "2026-06-30", label: "juni 2026" },
      comparisonPeriod: null,
      coverage: { available: 4, total: 4, ratio: 1, missingSources: [] },
      metrics,
      statuses: {
        googleVisibility: "good",
        pageExperience: "needs_attention",
        localVisibility: "missing",
        technicalFoundation: "good",
      },
      technicalChecks: [],
      recommendations: [
        {
          key: "slow_lcp",
          severity: "medium",
          title: "Långsam laddtid",
          description: "Sidan laddar långsamt för mobila besökare.",
          service: "Prestandaoptimering",
        },
      ],
      primaryRecommendation: {
        key: "slow_lcp",
        severity: "medium",
        title: "Långsam laddtid",
        description: "Sidan laddar långsamt för mobila besökare.",
        service: "Prestandaoptimering",
      },
    };
    const html = buildReportEmailHtml({
      companyName: "JVS Maskiner AB",
      periodLabel: "juni 2026",
      aiContent,
      metrics,
      viewModel,
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });
    expect(html).toContain("Klick från Google");
    expect(html).toContain("Vi föreslår en SEO-insats.");
    expect(html).toContain("Snittposition (lägre är bättre)");
    expect(html).toContain("jvs maskiner");
    // Dark mode: color-scheme deklareras så Apple/iOS Mail inte tvångsinverterar,
    // och loggan är den opaka badge-varianten (klarar Gmail-app-invertering).
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain("axona-logo-report-badge.png");
    // Mailet leder med #1-åtgärden (fallback ur recommendations när AI saknar action_plan)
    expect(html).toContain("Viktigast just nu");
    // "Viktigast just nu" ligger UNDER statistiken (datatäckning + KPI + sökord).
    const idxCoverage = html.indexOf("DATATÄCKNING");
    const idxQueries = html.indexOf("Vanligaste sökorden");
    const idxLead = html.indexOf("Viktigast just nu");
    expect(idxQueries).toBeGreaterThan(idxCoverage);
    expect(idxLead).toBeGreaterThan(idxQueries);
    expect(html).toContain("Långsam laddtid");
    expect(html).toContain("Så löser vi det");
    expect(html).toContain("Rekommenderat nästa steg");
    expect(html).toContain("Prestandaoptimering");
  });

  it("CTA falls back to a mailto with a prefilled subject when no bookingUrl is set", () => {
    const html = buildReportEmailHtml({
      companyName: "JVS Maskiner AB",
      periodLabel: "juni 2026",
      aiContent,
      metrics: computeReportMetrics(snap, null),
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });
    expect(html).toContain("Boka 15 min genomgång");
    expect(html).toContain(
      `href="mailto:hej%40axonadigital.se?subject=Genomg%C3%A5ng%20av%20synlighetsrapport"`,
    );
    expect(html).toContain("Svara på detta mejl");
  });

  it("CTA uses the booking URL as the primary link when provided", () => {
    const html = buildReportEmailHtml({
      companyName: "JVS Maskiner AB",
      periodLabel: "juni 2026",
      aiContent,
      metrics: computeReportMetrics(snap, null),
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
      bookingUrl: "https://cal.com/axona/genomgang",
    });
    expect(html).toContain(`href="https://cal.com/axona/genomgang"`);
    expect(html).toContain("Boka 15 min genomgång");
    // Sekundär mailto-länk finns kvar även när en bokningslänk är satt.
    expect(html).toContain(`href="mailto:hej%40axonadigital.se"`);
    expect(html).toContain("Svara på detta mejl");
  });

  it("escapes HTML in customer-controlled values", () => {
    const html = buildReportEmailHtml({
      companyName: "<script>x</script>",
      periodLabel: "juni 2026",
      aiContent,
      metrics: computeReportMetrics(snap, null),
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits search rows when there is no GSC data", () => {
    const html = buildReportEmailHtml({
      companyName: "X",
      periodLabel: "juni 2026",
      aiContent,
      metrics: computeReportMetrics(
        { performance_score: 80, pagespeed: { lcp_ms: 2000 } },
        null,
      ),
      hasSearchData: false,
      replyToEmail: "hej@axonadigital.se",
    });
    expect(html).not.toContain("Klick från Google");
    expect(html).toContain("Laddtid");
  });

  it("hides the laddtid and position cards when the policy suppresses them", () => {
    const weakSnap: ReportSnapshot = {
      performance_score: 45,
      pagespeed: { lcp_ms: 6100, cls: 0 },
      search_console: {
        clicks: 12,
        impressions: 334,
        position: 34.7,
        top_queries: [],
      },
    };
    const metrics = computeReportMetrics(weakSnap, null);
    const viewModel: ReportViewModel = {
      version: 2,
      companyName: "Svag Kund AB",
      period: { start: "2026-05-01", end: "2026-05-31", label: "maj 2026" },
      comparisonPeriod: null,
      coverage: { available: 4, total: 4, ratio: 1, missingSources: [] },
      metrics,
      statuses: {
        googleVisibility: "poor",
        pageExperience: "poor",
        localVisibility: "missing",
        technicalFoundation: "good",
      },
      technicalChecks: [],
      recommendations: [],
      primaryRecommendation: null,
      presentation: {
        ...DEFAULT_PRESENTATION,
        tone: "reassure",
        showLcp: false,
        showPerformanceScore: false,
        showPositionAbsolute: false,
        showPageExperience: false,
        showFourParts: false,
      },
    };
    const html = buildReportEmailHtml({
      companyName: "Svag Kund AB",
      periodLabel: "maj 2026",
      aiContent,
      metrics,
      viewModel,
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });
    expect(html).not.toContain("Laddtid");
    expect(html).not.toContain("Snittposition");
    expect(html).not.toContain("34,7");
  });

  it("exposes the hidden-finding key list", () => {
    expect(CUSTOMER_HIDDEN_FINDING_KEYS).toContain("missing_llms_txt");
  });

  it("lets recommended_service override the primary recommendation heading and lead action", () => {
    const metrics = computeReportMetrics(snap, null);
    const viewModel: ReportViewModel = {
      version: 2,
      companyName: "JVS Maskiner AB",
      period: { start: "2026-06-01", end: "2026-06-30", label: "juni 2026" },
      comparisonPeriod: null,
      coverage: { available: 4, total: 4, ratio: 1, missingSources: [] },
      metrics,
      statuses: {
        googleVisibility: "good",
        pageExperience: "needs_attention",
        localVisibility: "missing",
        technicalFoundation: "good",
      },
      technicalChecks: [],
      recommendations: [
        {
          key: "slow_lcp",
          severity: "medium",
          title: "Långsam laddtid",
          description: "Sidan laddar långsamt för mobila besökare.",
          service: "Prestandaoptimering",
        },
        {
          key: "low_position",
          severity: "medium",
          title: "Nära första sidan",
          description: "Flera sökord ligger precis utanför topp 10.",
          service: "SEO-optimering",
        },
      ],
      primaryRecommendation: {
        key: "slow_lcp",
        severity: "medium",
        title: "Långsam laddtid",
        description: "Sidan laddar långsamt för mobila besökare.",
        service: "Prestandaoptimering",
      },
    };
    const html = buildReportEmailHtml({
      companyName: "JVS Maskiner AB",
      periodLabel: "juni 2026",
      aiContent: { ...aiContent, recommended_service: "SEO-optimering" },
      metrics,
      viewModel,
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });
    expect(html).toContain("Rekommenderat nästa steg · SEO-optimering");
    // action_plan-fallbacken byggs ur recommendations — SEO-posten flyttas
    // fram och blir "Viktigast just nu" trots att den låg sist i listan.
    expect(html).toContain("Nära första sidan");
    const idxLeadLabel = html.indexOf("Viktigast just nu");
    const idxSeoTitle = html.indexOf("Nära första sidan");
    const idxLcpTitle = html.indexOf("Långsam laddtid");
    expect(idxSeoTitle).toBeGreaterThan(idxLeadLabel);
    expect(idxSeoTitle).toBeLessThan(idxLcpTitle);
  });

  it("does not let an old Google Business action_plan lead when SEO is selected", () => {
    const metrics = computeReportMetrics(snap, null);
    const viewModel: ReportViewModel = {
      version: 2,
      companyName: "Axona Digital AB",
      period: { start: "2026-06-01", end: "2026-06-30", label: "juni 2026" },
      comparisonPeriod: null,
      coverage: { available: 4, total: 4, ratio: 1, missingSources: [] },
      metrics,
      statuses: {
        googleVisibility: "good",
        pageExperience: "needs_attention",
        localVisibility: "missing",
        technicalFoundation: "good",
      },
      technicalChecks: [],
      recommendations: [
        {
          key: "missing_business_profile",
          severity: "high",
          title: "Google Business saknas",
          description: "Ni syns inte i lokala kartresultat.",
          service: "Google Business-paket",
        },
        {
          key: "low_position",
          severity: "medium",
          title: "Nära första sidan",
          description: "Flera sökord ligger precis utanför topp 10.",
          service: "SEO-optimering",
        },
      ],
      primaryRecommendation: {
        key: "missing_business_profile",
        severity: "high",
        title: "Google Business saknas",
        description: "Ni syns inte i lokala kartresultat.",
        service: "Google Business-paket",
      },
    };

    const html = buildReportEmailHtml({
      companyName: "Axona Digital AB",
      periodLabel: "juni 2026",
      aiContent: {
        ...aiContent,
        recommended_service: "SEO-optimering",
        action_plan: [
          {
            key: "missing_business_profile",
            what_we_see: "Google Business-profilen saknas.",
            what_it_means: "Lokala kunder hittar er inte lika enkelt.",
            how_we_help: "Vi sätter upp Google Business-paketet.",
            next_step: "Hör av er så startar vi.",
          },
        ],
      },
      metrics,
      viewModel,
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });

    expect(html).toContain("Rekommenderat nästa steg · SEO-optimering");
    const idxLeadLabel = html.indexOf("Viktigast just nu");
    const idxSeoTitle = html.indexOf("Nära första sidan");
    const idxGoogleTitle = html.indexOf("Google Business saknas");
    expect(idxSeoTitle).toBeGreaterThan(idxLeadLabel);
    expect(idxSeoTitle).toBeLessThan(idxGoogleTitle);
  });

  it("leads with selected SEO text even when no SEO finding exists", () => {
    const metrics = computeReportMetrics(snap, null);
    const viewModel: ReportViewModel = {
      version: 2,
      companyName: "Axona Digital AB",
      period: { start: "2026-06-01", end: "2026-06-30", label: "juni 2026" },
      comparisonPeriod: null,
      coverage: { available: 4, total: 4, ratio: 1, missingSources: [] },
      metrics,
      statuses: {
        googleVisibility: "good",
        pageExperience: "needs_attention",
        localVisibility: "missing",
        technicalFoundation: "good",
      },
      technicalChecks: [],
      recommendations: [
        {
          key: "missing_business_profile",
          severity: "high",
          title: "Google Business saknas",
          description: "Ni syns inte i lokala kartresultat.",
          service: "Google Business-paket",
        },
      ],
      primaryRecommendation: {
        key: "missing_business_profile",
        severity: "high",
        title: "Google Business saknas",
        description: "Ni syns inte i lokala kartresultat.",
        service: "Google Business-paket",
      },
    };

    const html = buildReportEmailHtml({
      companyName: "Axona Digital AB",
      periodLabel: "juni 2026",
      aiContent: {
        ...aiContent,
        recommended_service: "SEO-optimering",
        recommended_action: "Vi rekommenderar SEO-optimering.",
        upsell_pitch: "Det hjälper er lyfta fler viktiga sökord.",
        action_plan: [
          {
            key: "missing_business_profile",
            what_we_see: "Google Business-profilen saknas.",
            what_it_means: "Lokala kunder hittar er inte lika enkelt.",
            how_we_help: "Vi sätter upp Google Business-paketet.",
            next_step: "Hör av er så startar vi.",
          },
        ],
      },
      metrics,
      viewModel,
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });

    expect(html).toContain("Rekommenderat nästa steg · SEO-optimering");
    const idxLeadLabel = html.indexOf("Viktigast just nu");
    const idxSeoText = html.indexOf("Vi rekommenderar SEO-optimering.");
    const idxGoogleText = html.indexOf("Google Business-profilen saknas.");
    expect(idxSeoText).toBeGreaterThan(idxLeadLabel);
    expect(idxSeoText).toBeLessThan(idxGoogleText);
  });

  it("shows Sökordsrörelser only when the resolved recommendation is SEO-optimering", () => {
    const seoSnap: ReportSnapshot = {
      ...snap,
      search_console: {
        ...snap.search_console!,
        top_queries: [
          { query: "jvs maskiner", clicks: 10, impressions: 40, position: 3.0 },
        ],
      },
    };
    const priorSnap: ReportSnapshot = {
      search_console: {
        clicks: 8,
        impressions: 30,
        position: 12,
        top_queries: [
          { query: "jvs maskiner", clicks: 6, impressions: 30, position: 9.0 },
        ],
      },
    };
    const metrics = computeReportMetrics(seoSnap, priorSnap);

    const withoutOverride = buildReportEmailHtml({
      companyName: "JVS Maskiner AB",
      periodLabel: "juni 2026",
      aiContent,
      metrics,
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });
    // Kollar den faktiska sektionsrubriken (en <p>-tagg), inte HTML-kommentaren
    // som alltid finns i mallen oavsett gate.
    expect(withoutOverride).not.toContain(">Sökordsrörelser<");

    const withOverride = buildReportEmailHtml({
      companyName: "JVS Maskiner AB",
      periodLabel: "juni 2026",
      aiContent: { ...aiContent, recommended_service: "SEO-optimering" },
      metrics,
      hasSearchData: true,
      replyToEmail: "hej@axonadigital.se",
    });
    expect(withOverride).toContain(">Sökordsrörelser<");
    expect(withOverride).toContain("jvs maskiner");
  });
});
