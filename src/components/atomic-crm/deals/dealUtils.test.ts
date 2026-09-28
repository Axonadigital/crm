import { describe, it, expect } from "vitest";

import {
  annualizeRecurring,
  findDealLabel,
  formatRecurringLabel,
  getRelativeTimeString,
  totalDealValue,
} from "./dealUtils";
import type { DealStage } from "../types";

const dealStages: DealStage[] = [
  { value: "opportunity", label: "Opportunity" },
  { value: "proposal-sent", label: "Proposal Sent" },
  { value: "in-negotiation", label: "In Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

describe("findDealLabel", () => {
  it("returns the label for a matching stage value", () => {
    expect(findDealLabel(dealStages, "opportunity")).toBe("Opportunity");
    expect(findDealLabel(dealStages, "won")).toBe("Won");
  });

  it("returns undefined for a non-existent stage value", () => {
    expect(findDealLabel(dealStages, "nonexistent")).toBeUndefined();
  });

  it("returns undefined for an empty stages array", () => {
    expect(findDealLabel([], "opportunity")).toBeUndefined();
  });
});

describe("getRelativeTimeString", () => {
  // Helper to create a date string offset from today
  const dateOffsetFromToday = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  };

  it('returns "today" for today\'s date', () => {
    const result = getRelativeTimeString(dateOffsetFromToday(0));
    expect(result.toLowerCase()).toBe("today");
  });

  it('returns "tomorrow" for tomorrow\'s date', () => {
    const result = getRelativeTimeString(dateOffsetFromToday(1));
    expect(result.toLowerCase()).toBe("tomorrow");
  });

  it('returns "yesterday" for yesterday\'s date', () => {
    const result = getRelativeTimeString(dateOffsetFromToday(-1));
    expect(result.toLowerCase()).toBe("yesterday");
  });

  it("returns relative day format for dates within a week", () => {
    const result = getRelativeTimeString(dateOffsetFromToday(3));
    // Should contain "3 days" in some form
    expect(result.toLowerCase()).toContain("3");
  });

  it("returns absolute date format for dates more than a week away", () => {
    const result = getRelativeTimeString(dateOffsetFromToday(10));
    // Should be a formatted date like "April 15" (not relative)
    expect(result).not.toContain("day");
    expect(result).not.toContain("tomorrow");
  });

  it("returns absolute date format for dates more than a week in the past", () => {
    const result = getRelativeTimeString(dateOffsetFromToday(-10));
    expect(result).not.toContain("day");
    expect(result).not.toContain("yesterday");
  });

  it("capitalizes the first character of the result", () => {
    const result = getRelativeTimeString(dateOffsetFromToday(0));
    expect(result[0]).toBe(result[0].toUpperCase());
  });
});

describe("annualizeRecurring", () => {
  it("returns amount * 12 for monthly", () => {
    expect(annualizeRecurring(1000, "monthly")).toBe(12000);
  });

  it("returns amount * 4 for quarterly", () => {
    expect(annualizeRecurring(1000, "quarterly")).toBe(4000);
  });

  it("returns amount as-is for yearly", () => {
    expect(annualizeRecurring(1000, "yearly")).toBe(1000);
  });

  it("returns 0 when amount is null", () => {
    expect(annualizeRecurring(null, "monthly")).toBe(0);
  });

  it("returns 0 when interval is null", () => {
    expect(annualizeRecurring(1000, null)).toBe(0);
  });

  it("returns 0 when both are undefined", () => {
    expect(annualizeRecurring(undefined, undefined)).toBe(0);
  });

  it("returns 0 for an invalid interval", () => {
    expect(annualizeRecurring(1000, "weekly")).toBe(0);
  });
});

describe("totalDealValue", () => {
  it("returns only amount when no recurring fields", () => {
    expect(
      totalDealValue({
        amount: 5000,
        recurring_amount: null,
        recurring_interval: null,
      }),
    ).toBe(5000);
  });

  it("adds annualized recurring to amount", () => {
    expect(
      totalDealValue({
        amount: 5000,
        recurring_amount: 1000,
        recurring_interval: "monthly",
      }),
    ).toBe(17000);
  });

  it("handles zero amount with recurring", () => {
    expect(
      totalDealValue({
        amount: 0,
        recurring_amount: 2000,
        recurring_interval: "quarterly",
      }),
    ).toBe(8000);
  });

  it("handles undefined recurring fields", () => {
    expect(
      totalDealValue({
        amount: 3000,
        recurring_amount: undefined,
        recurring_interval: undefined,
      }),
    ).toBe(3000);
  });
});

describe("formatRecurringLabel", () => {
  it("returns /mån for monthly", () => {
    expect(formatRecurringLabel("monthly")).toBe("/mån");
  });

  it("returns /kv for quarterly", () => {
    expect(formatRecurringLabel("quarterly")).toBe("/kv");
  });

  it("returns /år for yearly", () => {
    expect(formatRecurringLabel("yearly")).toBe("/år");
  });

  it("returns empty string for null", () => {
    expect(formatRecurringLabel(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatRecurringLabel(undefined)).toBe("");
  });
});
