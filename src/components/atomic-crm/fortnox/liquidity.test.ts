import { describe, expect, it } from "vitest";

import {
  monthlyAmount,
  monthsRemainingInYear,
  projectYearEnd,
} from "./liquidity";

describe("monthlyAmount", () => {
  it("keeps a monthly amount as-is", () => {
    expect(monthlyAmount(1000, "monthly")).toBe(1000);
  });

  it("spreads a quarterly amount over 3 months", () => {
    expect(monthlyAmount(900, "quarterly")).toBe(300);
  });

  it("spreads a yearly amount over 12 months", () => {
    expect(monthlyAmount(5988, "yearly")).toBe(499);
  });

  it("treats a missing interval as monthly", () => {
    expect(monthlyAmount(299, null)).toBe(299);
    expect(monthlyAmount(299, undefined)).toBe(299);
  });

  it("returns 0 for a missing amount", () => {
    expect(monthlyAmount(null, "monthly")).toBe(0);
    expect(monthlyAmount(0, "monthly")).toBe(0);
  });
});

describe("monthsRemainingInYear", () => {
  it("returns 5 in July", () => {
    // July = month index 6 → Aug..Dec = 5 months left.
    expect(monthsRemainingInYear(new Date(2026, 6, 17))).toBe(5);
  });

  it("returns 0 in December", () => {
    expect(monthsRemainingInYear(new Date(2026, 11, 31))).toBe(0);
  });

  it("returns 11 in January", () => {
    expect(monthsRemainingInYear(new Date(2026, 0, 1))).toBe(11);
  });
});

describe("projectYearEnd", () => {
  it("adds the net runrate across the remaining months", () => {
    // 79 372 booked + 1 500/mån net × 5 months = 86 872.
    expect(projectYearEnd(79372, 1500, 5)).toBe(86872);
  });

  it("handles a negative runrate", () => {
    expect(projectYearEnd(10000, -2000, 3)).toBe(4000);
  });
});
