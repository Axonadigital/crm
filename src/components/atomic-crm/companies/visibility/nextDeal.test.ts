import { describe, expect, it } from "vitest";

import { buildNextDealRecommendation } from "./nextDeal";
import type { Company, WebsiteSnapshot } from "../../types";

const company = {
  id: 1,
  name: "Testbolaget",
  primary_goal: "fler offertförfrågningar",
  primary_geo_area: "Stockholm",
} as Company;

const snapshot = {
  id: 10,
  company_id: 1,
  fetched_at: "2026-07-01T00:00:00Z",
  source: "manual",
  url: "https://example.com",
  search_console: {
    clicks: 100,
    impressions: 2000,
    position: 8.2,
    top_queries: [],
    branded: { clicks: 85, impressions: 900, queries: 3 },
    non_branded: { clicks: 15, impressions: 1100, queries: 20 },
  },
  business_profile: { found: true, rating: 4.2, reviews_count: 7 },
  findings: [],
  created_at: "2026-07-01T00:00:00Z",
} as WebsiteSnapshot;

describe("buildNextDealRecommendation", () => {
  it("turns a finding into a sales-ready recommendation", () => {
    const recommendation = buildNextDealRecommendation({
      company,
      snapshot,
      brandShare: 0.85,
      finding: {
        key: "high_brand_share",
        severity: "medium",
        service: "SEO",
        title: "Hög andel varumärkesklick",
        description: "Fler nya kunder behöver hitta tjänsterna.",
        internalNote: "Discovery-sökningar är svaga.",
      },
    });

    expect(recommendation?.packageName).toBe("SEO Discovery-paket");
    expect(recommendation?.why).toContain("fler offertförfrågningar");
    expect(recommendation?.why).toContain("Stockholm");
    expect(recommendation?.evidence).toContain(
      "85 % av klick från varumärkessökningar.",
    );
    expect(recommendation?.salesArgument).toContain("namn");
  });
});
