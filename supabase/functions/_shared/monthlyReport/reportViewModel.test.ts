import { describe, expect, it } from "vitest";
import {
  buildFallbackReportContent,
  buildReportViewModel,
} from "./reportViewModel.ts";
import type { ReportSnapshot } from "./types.ts";

const latest: ReportSnapshot = {
  period_start: "2026-05-01",
  period_end: "2026-05-31",
  window_kind: "calendar_month",
  data_coverage: { available_sources: 4, total_sources: 4 },
  source_status: {
    pagespeed: { status: "available" },
    seo_crawl: { status: "available" },
    business_profile: { status: "available" },
    search_console: { status: "available" },
  },
  performance_score: 72,
  field_data: {
    scope: "origin",
    lcp_ms: 2900,
    inp_ms: 180,
    cls: 0.08,
    lcp_rating: "NEEDS_IMPROVEMENT",
    inp_rating: "GOOD",
    cls_rating: "GOOD",
  },
  seo_checks: {
    title: "Test",
    meta_description: "Test",
    h1: true,
    sitemap: true,
    schema_org: false,
  },
  business_profile: { found: true, rating: 4.7, reviews_count: 12 },
  search_console: {
    clicks: 50,
    impressions: 1000,
    ctr: 0.05,
    position: 8,
    top_queries: [],
    opportunities: [],
  },
  findings: [
    {
      key: "missing_schema_org",
      severity: "medium",
      title: "Saknar strukturerad data",
      description: "Google förstår sidan sämre.",
      service: "AI-sök-optimering",
    },
  ],
};

describe("report view model", () => {
  it("keeps deterministic values and category statuses together", () => {
    const model = buildReportViewModel({
      companyName: "Test AB",
      periodLabel: "maj 2026",
      latest,
      previous: null,
    });
    expect(model.period.start).toBe("2026-05-01");
    expect(model.metrics.clicks.current).toBe(50);
    expect(model.statuses.googleVisibility).toBe("good");
    expect(model.statuses.pageExperience).toBe("needs_attention");
    expect(model.primaryRecommendation?.key).toBe("missing_schema_org");
  });

  it("uses deterministic fallback content when AI is unavailable", () => {
    const model = buildReportViewModel({
      companyName: "Test AB",
      periodLabel: "maj 2026",
      latest,
      previous: null,
    });
    const content = buildFallbackReportContent(model, "Anna Andersson");
    expect(content.greeting).toBe("Hej Anna,");
    expect(content.summary).toContain("50");
    expect(content.recommended_action).toContain("strukturerad data");
  });

  it("names the real comparison period in fallback text for multi-month reports, not 'månaden före'", () => {
    // Regression: en juni–juli-rapport jämförs mot april–maj (lika lång
    // föregående period), men fallback-texten sa alltid "månaden före" —
    // vilket lästes som "jämfört med juni", inte den faktiska jämförelsen.
    const multiMonthLatest: ReportSnapshot = {
      ...latest,
      period_start: "2026-06-01",
      period_end: "2026-07-31",
      search_console: { ...latest.search_console!, clicks: 150 },
    };
    const previous: ReportSnapshot = {
      ...latest,
      period_start: "2026-04-01",
      period_end: "2026-05-31",
      search_console: { ...latest.search_console!, clicks: 50 },
    };
    const model = buildReportViewModel({
      companyName: "Test AB",
      periodLabel: "juni – juli 2026",
      latest: multiMonthLatest,
      previous,
    });
    const content = buildFallbackReportContent(model, "Anna Andersson");
    expect(content.summary).not.toContain("månaden före");
    expect(content.summary).toContain("perioden innan (april–maj)");
  });

  it("adds an honest caveat when the aggregate is up but the last month within the period fell", () => {
    // Regression: juni (40 klick) → juli (23 klick) — en nedgång inom
    // perioden — men aggregatet (63) är ändå högre än jämförelseperioden
    // (april–maj), så headlinen sa bara "294 % högre" utan att nämna att
    // senaste månaden i själva verket gick ner. Kunden läste det som att
    // allt gick uppåt, trots motsatsen i "Utveckling per månad"-grafen.
    const multiMonthLatest: ReportSnapshot = {
      ...latest,
      period_start: "2026-06-01",
      period_end: "2026-07-31",
      search_console: { ...latest.search_console!, clicks: 63 },
    };
    const previous: ReportSnapshot = {
      ...latest,
      period_start: "2026-04-01",
      period_end: "2026-05-31",
      search_console: { ...latest.search_console!, clicks: 16 },
    };
    const model = buildReportViewModel({
      companyName: "Test AB",
      periodLabel: "juni – juli 2026",
      latest: multiMonthLatest,
      previous,
    });
    model.metrics.monthlySeries = [
      { month: "2026-06", clicks: 40, impressions: 1114 },
      { month: "2026-07", clicks: 23, impressions: 628 },
    ];
    const content = buildFallbackReportContent(model, "Anna Andersson");
    expect(content.summary).toContain(
      "även om juli var lägre än juni inom perioden",
    );
  });
});
