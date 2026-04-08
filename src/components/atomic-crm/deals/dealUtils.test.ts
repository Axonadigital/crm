import { describe, it, expect } from "vitest";

import { findDealLabel, getRelativeTimeString } from "./dealUtils";
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
