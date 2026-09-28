import { describe, expect, it } from "vitest";
import { computeKeywordMovers } from "./keywordMovement.ts";
import type { ReportSnapshot } from "./types.ts";

const latest: ReportSnapshot = {
  search_console: {
    clicks: 10,
    impressions: 100,
    position: 10,
    top_queries: [
      {
        query: "automatisera processer",
        clicks: 0,
        impressions: 74,
        position: 40.9,
      },
      { query: "axona", clicks: 3, impressions: 80, position: 5.0 },
      {
        query: "automatisera kundprocess",
        clicks: 0,
        impressions: 20,
        position: 17.0,
      },
      { query: "helt ny sökfras", clicks: 0, impressions: 5, position: 55.0 },
    ],
  },
};

const previous: ReportSnapshot = {
  search_console: {
    clicks: 8,
    impressions: 90,
    position: 12,
    top_queries: [
      {
        query: "automatisera processer",
        clicks: 0,
        impressions: 60,
        position: 52.6,
      },
      { query: "axona", clicks: 2, impressions: 70, position: 14.0 },
      {
        query: "automatisera kundprocess",
        clicks: 0,
        impressions: 18,
        position: 14.8,
      },
    ],
  },
};

describe("computeKeywordMovers", () => {
  it("splits movers into improved (lower position) and declined (higher position)", () => {
    const { improved, declined } = computeKeywordMovers(latest, previous);
    expect(improved.map((m) => m.query)).toEqual([
      "automatisera processer",
      "axona",
    ]);
    expect(declined.map((m) => m.query)).toEqual(["automatisera kundprocess"]);
  });

  it("computes delta as current minus previous position", () => {
    const { improved } = computeKeywordMovers(latest, previous);
    const axona = improved.find((m) => m.query === "axona");
    expect(axona?.delta).toBeCloseTo(5.0 - 14.0, 5);
    expect(axona?.current).toBe(5.0);
    expect(axona?.previous).toBe(14.0);
  });

  it("sorts improved by biggest gain first and caps at 5", () => {
    const { improved } = computeKeywordMovers(latest, previous);
    // automatisera processer improved by 11.7, axona by 9.0 — biggest first.
    expect(improved[0].query).toBe("automatisera processer");
  });

  it("ignores queries with no prior position (new queries) and unchanged positions", () => {
    const { improved, declined } = computeKeywordMovers(latest, previous);
    const all = [...improved, ...declined].map((m) => m.query);
    expect(all).not.toContain("helt ny sökfras");
  });

  it("returns empty lists when either snapshot is missing search data", () => {
    expect(computeKeywordMovers(null, previous)).toEqual({
      improved: [],
      declined: [],
    });
    expect(computeKeywordMovers(latest, null)).toEqual({
      improved: [],
      declined: [],
    });
    expect(computeKeywordMovers(undefined, undefined)).toEqual({
      improved: [],
      declined: [],
    });
  });
});
