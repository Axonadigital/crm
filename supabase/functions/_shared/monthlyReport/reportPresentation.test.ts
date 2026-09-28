import { describe, expect, it } from "vitest";
import {
  buildPresentationPolicy,
  DEFAULT_PRESENTATION,
  resolvePresentation,
} from "./reportPresentation.ts";
import type { MetricTrend, ReportViewModel } from "./types.ts";

const trend = (
  current: number | null,
  deltaPct: number | null = null,
  deltaAbsolute: number | null = null,
): MetricTrend => ({ current, previous: null, deltaPct, deltaAbsolute });

function viewModel(
  over: Partial<ReportViewModel["metrics"]>,
  statuses: Partial<ReportViewModel["statuses"]> = {},
): ReportViewModel {
  return {
    version: 2,
    companyName: "Test AB",
    period: { start: "2026-05-01", end: "2026-05-31", label: "maj 2026" },
    comparisonPeriod: null,
    coverage: { available: 4, total: 4, ratio: 1, missingSources: [] },
    metrics: {
      clicks: trend(null),
      impressions: trend(null),
      ctr: trend(null),
      position: trend(null),
      performance_score: trend(null),
      lcp_ms: trend(null),
      field_lcp_ms: trend(null),
      field_inp_ms: trend(null),
      field_cls: trend(null),
      reviews_count: trend(null),
      topQueries: [],
      topPages: [],
      opportunities: [],
      branded: null,
      nonBranded: null,
      isFirstReport: false,
      ...over,
    },
    statuses: {
      googleVisibility: "missing",
      pageExperience: "missing",
      localVisibility: "missing",
      technicalFoundation: "missing",
      ...statuses,
    },
    technicalChecks: [],
    recommendations: [],
    primaryRecommendation: null,
  };
}

describe("buildPresentationPolicy", () => {
  it("always removes the 'Fyra delar' scorecard and methodology by default", () => {
    const policy = buildPresentationPolicy(viewModel({}));
    expect(policy.showFourParts).toBe(false);
    expect(policy.showMethodology).toBe(false);
    expect(policy.filterZeroClickQueries).toBe(true);
  });

  it("hides raw Axona-owned numbers when they are weak", () => {
    const policy = buildPresentationPolicy(
      viewModel(
        {
          performance_score: trend(45, 0),
          lcp_ms: trend(6100),
          position: trend(34.7, null, 5), // sämre
        },
        { pageExperience: "poor" },
      ),
    );
    expect(policy.showPerformanceScore).toBe(false);
    expect(policy.showLcp).toBe(false);
    expect(policy.showPositionAbsolute).toBe(false);
    expect(policy.showPositionTrend).toBe(false);
    expect(policy.showPageExperience).toBe(false);
    expect(policy.tone).toBe("reassure");
  });

  it("shows the raw numbers and celebrates when they are genuinely strong", () => {
    const policy = buildPresentationPolicy(
      viewModel(
        {
          clicks: trend(50, 54),
          impressions: trend(334, 9),
          performance_score: trend(92, 5),
          lcp_ms: trend(2100),
          position: trend(6, null, -3),
          field_lcp_ms: trend(2100),
        },
        {
          googleVisibility: "good",
          pageExperience: "good",
          localVisibility: "good",
          technicalFoundation: "good",
        },
      ),
    );
    expect(policy.showPerformanceScore).toBe(true);
    expect(policy.showLcp).toBe(true);
    expect(policy.showPositionAbsolute).toBe(true);
    expect(policy.showClicks).toBe(true);
    expect(policy.showPageExperience).toBe(true);
    expect(policy.tone).toBe("celebrate");
  });

  it("hides a KPI card when its trend is a clear decline", () => {
    const policy = buildPresentationPolicy(
      viewModel({
        clicks: trend(10, -40),
        impressions: trend(100, 5),
      }),
    );
    expect(policy.showClicks).toBe(false); // nedgång döljs
    expect(policy.showImpressions).toBe(true); // uppgång visas
  });

  it("keeps a positive position trend even when the raw number is hidden", () => {
    const policy = buildPresentationPolicy(
      viewModel({ position: trend(34.7, null, -13.9) }),
    );
    expect(policy.showPositionAbsolute).toBe(false); // 34,7 döljs
    expect(policy.showPositionTrend).toBe(true); // förbättringen lyfts
  });
});

describe("resolvePresentation", () => {
  it("lets overrides win and ignores null/undefined fields", () => {
    const resolved = resolvePresentation(DEFAULT_PRESENTATION, {
      showFourParts: false,
      showLcp: undefined,
    });
    expect(resolved.showFourParts).toBe(false);
    expect(resolved.showLcp).toBe(true); // undefined ignoreras → behåller bas
  });

  it("returns the base unchanged for empty/nullish overrides", () => {
    expect(resolvePresentation(DEFAULT_PRESENTATION, null)).toEqual(
      DEFAULT_PRESENTATION,
    );
    expect(resolvePresentation(DEFAULT_PRESENTATION, {})).toEqual(
      DEFAULT_PRESENTATION,
    );
  });
});
