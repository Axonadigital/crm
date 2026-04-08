import { describe, it, expect } from "vitest";
import { quoteStatusColors, quoteStatusList } from "./quoteStatuses";
import type { QuoteStatus } from "../types";

describe("quoteStatuses", () => {
  describe("quoteStatusList", () => {
    it("contains all expected statuses", () => {
      expect(quoteStatusList).toEqual([
        "draft",
        "generated",
        "sent",
        "viewed",
        "signed",
        "declined",
        "expired",
      ]);
    });

    it("has 7 statuses", () => {
      expect(quoteStatusList).toHaveLength(7);
    });

    it("contains no duplicates", () => {
      const unique = new Set(quoteStatusList);
      expect(unique.size).toBe(quoteStatusList.length);
    });
  });

  describe("quoteStatusColors", () => {
    it("maps every status in quoteStatusList to a color", () => {
      for (const status of quoteStatusList) {
        expect(quoteStatusColors[status]).toBeDefined();
      }
    });

    it("returns valid Badge variants", () => {
      const validVariants = ["secondary", "outline", "default", "destructive"];
      for (const color of Object.values(quoteStatusColors)) {
        expect(validVariants).toContain(color);
      }
    });

    it("maps draft to secondary", () => {
      expect(quoteStatusColors.draft).toBe("secondary");
    });

    it("maps generated to outline", () => {
      expect(quoteStatusColors.generated).toBe("outline");
    });

    it("maps sent to default", () => {
      expect(quoteStatusColors.sent).toBe("default");
    });

    it("maps viewed to default", () => {
      expect(quoteStatusColors.viewed).toBe("default");
    });

    it("maps signed to default", () => {
      expect(quoteStatusColors.signed).toBe("default");
    });

    it("maps declined to destructive", () => {
      expect(quoteStatusColors.declined).toBe("destructive");
    });

    it("maps expired to secondary", () => {
      expect(quoteStatusColors.expired).toBe("secondary");
    });

    it("has an entry for every QuoteStatus", () => {
      const allStatuses: QuoteStatus[] = [
        "draft",
        "generated",
        "sent",
        "viewed",
        "signed",
        "declined",
        "expired",
      ];
      for (const status of allStatuses) {
        expect(status in quoteStatusColors).toBe(true);
      }
    });
  });
});
