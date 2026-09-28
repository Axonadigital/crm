import { format, startOfMonth } from "date-fns";
import { describe, expect, it } from "vitest";

import type { Deal, SalesEntry } from "../types";
import { aggregatePeriods } from "./useSalesTracking";

const mockEntry = (
  overrides: Partial<SalesEntry> & {
    amount: number;
    period_date: string;
    period_type: SalesEntry["period_type"];
  },
): SalesEntry => ({
  id: 1,
  sales_id: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const mockDeal = (
  overrides: Partial<Deal> & { amount: number; expected_closing_date: string },
): Deal => ({
  id: 1,
  name: "Test Deal",
  company_id: 1,
  contact_ids: [],
  category: "other",
  stage: "won",
  description: "",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  sales_id: 1,
  index: 0,
  ...overrides,
});

describe("aggregatePeriods", () => {
  it("returns buckets for all periods even when empty", () => {
    const result = aggregatePeriods([], [], "month");
    // 12 previous months + current = 13 buckets
    expect(result.length).toBe(13);
    expect(result.every((p) => p.manualSales === 0)).toBe(true);
    expect(result.every((p) => p.dealRevenue === 0)).toBe(true);
  });

  it("aggregates manual sales entries into correct month bucket", () => {
    // Use format() to avoid UTC timezone shifts
    const dateStr = format(startOfMonth(new Date()), "yyyy-MM-dd");

    const entry = mockEntry({
      amount: 50000,
      period_date: dateStr,
      period_type: "month",
    });
    const result = aggregatePeriods([entry], [], "month");

    const currentMonthBucket = result[result.length - 1];
    expect(currentMonthBucket.manualSales).toBe(50000);
    expect(currentMonthBucket.dealRevenue).toBe(0);
  });

  it("aggregates deal revenue into correct month bucket", () => {
    const now = new Date();
    // Use local-time date string (15th of current month)
    const dateStr = format(
      new Date(now.getFullYear(), now.getMonth(), 15),
      "yyyy-MM-dd",
    );

    const deal = mockDeal({ amount: 75000, expected_closing_date: dateStr });
    const result = aggregatePeriods([], [deal], "month");

    const currentMonthBucket = result[result.length - 1];
    expect(currentMonthBucket.dealRevenue).toBe(75000);
    expect(currentMonthBucket.manualSales).toBe(0);
  });

  it("sums multiple entries in the same period", () => {
    const dateStr = format(startOfMonth(new Date()), "yyyy-MM-dd");

    const entries = [
      mockEntry({
        id: 1,
        amount: 10000,
        period_date: dateStr,
        period_type: "month",
      }),
      mockEntry({
        id: 2,
        amount: 20000,
        period_date: dateStr,
        period_type: "month",
      }),
    ];
    const result = aggregatePeriods(entries, [], "month");

    const currentMonthBucket = result[result.length - 1];
    expect(currentMonthBucket.manualSales).toBe(30000);
  });

  it("returns 31 buckets for day view (today + 30 previous days)", () => {
    const result = aggregatePeriods([], [], "day");
    expect(result.length).toBe(31);
  });

  it("returns 13 buckets for week view (current + 12 previous weeks)", () => {
    const result = aggregatePeriods([], [], "week");
    expect(result.length).toBe(13);
  });

  it("ignores entries outside the cutoff window", () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const oldDate = format(twoYearsAgo, "yyyy-MM-dd");

    const entry = mockEntry({
      amount: 99999,
      period_date: oldDate,
      period_type: "month",
    });
    const result = aggregatePeriods([entry], [], "month");

    const total = result.reduce((sum, p) => sum + p.manualSales, 0);
    expect(total).toBe(0);
  });

  it("returns periods sorted chronologically (oldest first)", () => {
    const result = aggregatePeriods([], [], "month");
    for (let i = 1; i < result.length; i++) {
      expect(result[i].periodStart >= result[i - 1].periodStart).toBe(true);
    }
  });
});
