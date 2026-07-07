import { describe, expect, it } from "vitest";

import { computePageExperienceStatus } from "./pageExperienceStatus";

describe("computePageExperienceStatus", () => {
  it("trusts poor field data over lab data", () => {
    expect(
      computePageExperienceStatus({
        performance_score: 99,
        pagespeed: { cls: 0, tbt_ms: 0 },
        field_data: {
          scope: "origin",
          lcp_rating: "POOR",
          inp_rating: "GOOD",
          cls_rating: "GOOD",
        },
      }),
    ).toBe("poor");
  });

  it("does not downgrade lab-only results on one weak signal", () => {
    expect(
      computePageExperienceStatus({
        performance_score: 76,
        pagespeed: { cls: 0.02, tbt_ms: 50 },
        field_data: null,
      }),
    ).toBe("good");
  });

  it("downgrades lab-only results when multiple lab signals are weak", () => {
    expect(
      computePageExperienceStatus({
        performance_score: 76,
        pagespeed: { cls: 0.16, tbt_ms: 50 },
        field_data: null,
      }),
    ).toBe("needs_attention");
  });
});
