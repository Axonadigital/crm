import { describe, expect, it } from "vitest";

import {
  absoluteDelta,
  percentagePointTrendText,
  percentDelta,
  trendTextWithAbsolute,
} from "./trendFormatting";

describe("trend formatting", () => {
  it("computes relative and absolute deltas", () => {
    expect(percentDelta(120, 100)).toBe(20);
    expect(percentDelta(120, 0)).toBeNull();
    expect(absoluteDelta(120, 100)).toBe(20);
  });

  it("formats click and impression trends with absolute values and percent", () => {
    expect(trendTextWithAbsolute(20, 40, "klick")).toBe(
      "Förbättring 40 klick (+20 %)",
    );
    expect(trendTextWithAbsolute(-10, -25, "visningar")).toBe(
      "Försämring 25 visningar (-10 %)",
    );
  });

  it("formats CTR movement as percentage points", () => {
    expect(percentagePointTrendText(1.25)).toBe(
      "Förbättring 1,3 procentenheter",
    );
    expect(percentagePointTrendText(-0.4)).toBe(
      "Försämring 0,4 procentenheter",
    );
  });
});
