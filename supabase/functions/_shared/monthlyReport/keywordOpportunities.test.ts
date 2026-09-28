import { describe, expect, it } from "vitest";
import { computeKeywordOpportunities } from "./keywordOpportunities.ts";
import type { ReportSnapshot } from "./types.ts";

const latest: ReportSnapshot = {
  search_console: {
    clicks: 10,
    impressions: 100,
    position: 10,
    top_queries: [
      { query: "es byggmontage", clicks: 5, impressions: 40, position: 1.0 },
      { query: "es bygg", clicks: 1, impressions: 30, position: 6.8 },
      {
        query: "es byggmontage ab",
        clicks: 1,
        impressions: 20,
        position: 1.5,
      },
      {
        query: "byggmontage östersund",
        clicks: 0,
        impressions: 74,
        position: 12.4,
      },
      { query: "montageteam", clicks: 0, impressions: 55, position: 8.1 },
      { query: "exact three", clicks: 0, impressions: 15, position: 3.0 },
    ],
  },
};

describe("computeKeywordOpportunities", () => {
  it("keeps only queries positioned outside the top 3", () => {
    const result = computeKeywordOpportunities(latest);
    expect(result.map((r) => r.query)).not.toContain("es byggmontage");
    expect(result.map((r) => r.query)).not.toContain("es byggmontage ab");
    expect(result.map((r) => r.query)).not.toContain("exact three");
  });

  it("sorts by impressions descending", () => {
    const result = computeKeywordOpportunities(latest);
    expect(result.map((r) => r.query)).toEqual([
      "byggmontage östersund",
      "montageteam",
      "es bygg",
    ]);
  });

  it("rounds position to one decimal", () => {
    const result = computeKeywordOpportunities(latest);
    const esBygg = result.find((r) => r.query === "es bygg");
    expect(esBygg?.position).toBe(6.8);
  });

  it("returns an empty list when there is no search data", () => {
    expect(computeKeywordOpportunities(null)).toEqual([]);
    expect(computeKeywordOpportunities(undefined)).toEqual([]);
    expect(computeKeywordOpportunities({})).toEqual([]);
  });

  it("caps the result at 8 entries", () => {
    const manyQueries: ReportSnapshot = {
      search_console: {
        clicks: 0,
        impressions: 0,
        position: 0,
        top_queries: Array.from({ length: 20 }, (_, i) => ({
          query: `query-${i}`,
          clicks: 0,
          impressions: 100 - i,
          position: 10,
        })),
      },
    };
    expect(computeKeywordOpportunities(manyQueries)).toHaveLength(8);
  });
});
