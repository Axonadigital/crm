import { describe, expect, it } from "vitest";
import { monthlyReportContentSchema } from "./reportSchemas.ts";
import { buildMonthlyReportPrompts } from "./buildReportPrompt.ts";
import {
  buildReportEmailHtml,
  CUSTOMER_HIDDEN_FINDING_KEYS,
} from "./buildReportEmailHtml.ts";
import { computeReportMetrics } from "./computeReportMetrics.ts";
import { parseReportContent } from "./generateReportContent.ts";
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
    });
    expect(prompt).toContain("JVS Maskiner AB");
    expect(prompt).toContain("Klick från Google: 23");
    expect(prompt).toContain("SEO-optimering");
    expect(prompt).toContain("key: low_position");
    expect(systemPrompt).toContain("Nämn ALDRIG pris");
    expect(systemPrompt).toContain("Börja sammanfattningen");
    expect(systemPrompt).toContain("action_plan");
    expect(prompt).toContain("börja med det positiva");
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
    });
    expect(prompt).toContain("Sökdata (Google Search Console) saknas");
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
    // Mailet leder med #1-åtgärden (fallback ur recommendations när AI saknar action_plan)
    expect(html).toContain("Viktigast just nu");
    expect(html).toContain("Långsam laddtid");
    expect(html).toContain("Så löser vi det");
    expect(html).toContain("Rekommenderad tilläggstjänst");
    expect(html).toContain("Prestandaoptimering");
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

  it("exposes the hidden-finding key list", () => {
    expect(CUSTOMER_HIDDEN_FINDING_KEYS).toContain("missing_llms_txt");
  });
});
