import { describe, expect, it } from "vitest";

import {
  type CostRow,
  deviation,
  findUnregistered,
  matchesAlias,
  reconcile,
} from "./subscriptionReconcile";

const row = (over: Partial<CostRow>): CostRow => ({
  description: "X",
  month_count: 1,
  total_cost: 0,
  cost_90d: 0,
  last_date: null,
  ...over,
});

describe("matchesAlias", () => {
  it("matches an alias as a case-insensitive substring", () => {
    expect(matchesAlias("OPENAI *CHATGPT SUBSCR", ["chatgpt"])).toBe(true);
    expect(matchesAlias("CHATGPT MARS", ["CHATGPT"])).toBe(true);
  });

  it("does not match unrelated descriptions or empty aliases", () => {
    expect(matchesAlias("CLAUDE.AI SUBSCRIPTION", ["chatgpt"])).toBe(false);
    expect(matchesAlias("ANYTHING", ["", "  "])).toBe(false);
  });
});

describe("reconcile", () => {
  it("sums the 90-day cost of every matched vendor description", () => {
    const rows = [
      row({ description: "CLAUDE.AI SUBSCRIPTION", cost_90d: 1976 }),
      row({ description: "ANTHROPIC* CLAUDE SUB", cost_90d: 1080 }),
      row({ description: "OPENAI *CHATGPT", cost_90d: 199 }),
    ];
    const result = reconcile(["CLAUDE", "ANTHROPIC"], rows);
    expect(result.booked90d).toBe(3056);
    expect(result.bookedMonthly).toBeCloseTo(1018.67, 1);
    expect(result.matched).toEqual([
      "CLAUDE.AI SUBSCRIPTION",
      "ANTHROPIC* CLAUDE SUB",
    ]);
  });

  it("returns zero when nothing matches", () => {
    expect(reconcile(["FIGMA"], [row({ cost_90d: 500 })]).booked90d).toBe(0);
  });
});

describe("deviation", () => {
  const rec = (booked90d: number) => ({
    booked90d,
    bookedMonthly: booked90d / 3,
    matched: [],
  });

  it("flags missing when nothing booked recently", () => {
    expect(deviation(200, rec(0))).toBe("missing");
  });

  it("flags off when booked is far from declared", () => {
    // declared 200/mo but booked ~1000/mo (Max not Pro)
    expect(deviation(200, rec(3000))).toBe("off");
  });

  it("is ok when booked is close to declared", () => {
    // declared 350/mo, booked ~340/mo
    expect(deviation(350, rec(1020))).toBe("ok");
  });
});

describe("findUnregistered", () => {
  const rows = [
    row({ description: "N8N", month_count: 3, cost_90d: 780 }),
    row({
      description: "CLAUDE.AI SUBSCRIPTION",
      month_count: 3,
      cost_90d: 1976,
    }),
    row({ description: "ELGIGANTEN", month_count: 1, cost_90d: 8181 }), // one-off
    row({ description: "OLD VENDOR", month_count: 4, cost_90d: 0 }), // dead
  ];

  it("returns recurring, recently-active costs that match no subscription", () => {
    const subs = [{ aliases: ["CLAUDE", "ANTHROPIC"] }];
    const result = findUnregistered(rows, subs);
    expect(result.map((r) => r.description)).toEqual(["N8N"]);
  });
});
