import { describe, it, expect } from "vitest";

import { getDealsByStage } from "./stages";
import type { Deal, DealStage } from "../types";

const dealStages: DealStage[] = [
  { value: "opportunity", label: "Opportunity" },
  { value: "proposal-sent", label: "Proposal Sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const makeDeal = (
  overrides: Partial<Deal> & { stage: string; index: number },
): Deal => ({
  id: 1,
  name: "Test Deal",
  company_id: 1,
  contact_ids: [],
  category: "default",
  description: "",
  amount: 0,
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
  expected_closing_date: "2024-12-31",
  sales_id: 1,
  ...overrides,
});

describe("getDealsByStage", () => {
  it("returns empty object when dealStages is undefined", () => {
    const result = getDealsByStage([], undefined as unknown as DealStage[]);
    expect(result).toEqual({});
  });

  it("returns empty arrays for all stages when no deals provided", () => {
    const result = getDealsByStage([], dealStages);
    expect(result).toEqual({
      opportunity: [],
      "proposal-sent": [],
      won: [],
      lost: [],
    });
  });

  it("groups deals by their stage", () => {
    const deals = [
      makeDeal({ id: 1, stage: "opportunity", index: 0 }),
      makeDeal({ id: 2, stage: "won", index: 0 }),
      makeDeal({ id: 3, stage: "opportunity", index: 1 }),
    ];

    const result = getDealsByStage(deals, dealStages);

    expect(result["opportunity"]).toHaveLength(2);
    expect(result["won"]).toHaveLength(1);
    expect(result["proposal-sent"]).toHaveLength(0);
    expect(result["lost"]).toHaveLength(0);
  });

  it("sorts deals within each stage by index", () => {
    const deals = [
      makeDeal({ id: 1, stage: "opportunity", index: 3, name: "Third" }),
      makeDeal({ id: 2, stage: "opportunity", index: 1, name: "First" }),
      makeDeal({ id: 3, stage: "opportunity", index: 2, name: "Second" }),
    ];

    const result = getDealsByStage(deals, dealStages);
    const opportunityDeals = result["opportunity"];

    expect(opportunityDeals[0].name).toBe("First");
    expect(opportunityDeals[1].name).toBe("Second");
    expect(opportunityDeals[2].name).toBe("Third");
  });

  it("assigns deals with unknown stages to the first stage", () => {
    const deals = [makeDeal({ id: 1, stage: "nonexistent-stage", index: 0 })];

    const result = getDealsByStage(deals, dealStages);

    expect(result["opportunity"]).toHaveLength(1);
    expect(result["opportunity"][0].id).toBe(1);
  });

  it("handles multiple deals across all stages", () => {
    const deals = [
      makeDeal({ id: 1, stage: "opportunity", index: 0 }),
      makeDeal({ id: 2, stage: "proposal-sent", index: 0 }),
      makeDeal({ id: 3, stage: "won", index: 0 }),
      makeDeal({ id: 4, stage: "lost", index: 0 }),
    ];

    const result = getDealsByStage(deals, dealStages);

    expect(result["opportunity"]).toHaveLength(1);
    expect(result["proposal-sent"]).toHaveLength(1);
    expect(result["won"]).toHaveLength(1);
    expect(result["lost"]).toHaveLength(1);
  });
});
