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

  it("names the first month in the selected period as the comparison, not 'månaden före' or an external period", () => {
    // Regression: en juni–juli-rapport jämförs numera mot juni (den första
    // valda månaden, "sista mot första"), inte mot en extern period längre
    // bak och inte den generiska frasen "månaden före" (som lästes som att
    // juli jämfördes mot juni fast den riktiga jämförelsen var april–maj).
    const multiMonthLatest: ReportSnapshot = {
      ...latest,
      period_start: "2026-06-01",
      period_end: "2026-07-31",
      search_console: { ...latest.search_console!, clicks: 23 },
    };
    const previous: ReportSnapshot = {
      ...latest,
      period_start: "2026-06-01",
      period_end: "2026-06-30",
      search_console: { ...latest.search_console!, clicks: 40 },
    };
    const model = buildReportViewModel({
      companyName: "Test AB",
      periodLabel: "juni – juli 2026",
      latest: multiMonthLatest,
      previous,
    });
    const content = buildFallbackReportContent(model, "Anna Andersson");
    expect(content.summary).not.toContain("månaden före");
    expect(content.summary).not.toContain("perioden innan");
    expect(content.summary).toContain("42 % lägre än juni");
  });

  it("compares the last selected month against the first when there are more than two", () => {
    // En 3-månadersperiod (maj–juli) jämförs sista (juli) mot första (maj)
    // — inte mot en extern period. "Utveckling per månad" bär resten av
    // historien mellan dem.
    const multiMonthLatest: ReportSnapshot = {
      ...latest,
      period_start: "2026-05-01",
      period_end: "2026-07-31",
      search_console: { ...latest.search_console!, clicks: 80 },
    };
    const previous: ReportSnapshot = {
      ...latest,
      period_start: "2026-05-01",
      period_end: "2026-05-31",
      search_console: { ...latest.search_console!, clicks: 40 },
    };
    const model = buildReportViewModel({
      companyName: "Test AB",
      periodLabel: "maj – juli 2026",
      latest: multiMonthLatest,
      previous,
    });
    const content = buildFallbackReportContent(model, "Anna Andersson");
    expect(content.summary).toContain("100 % högre än maj");
  });
});
