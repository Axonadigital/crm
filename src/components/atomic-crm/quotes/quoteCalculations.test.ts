import { describe, it, expect } from "vitest";
import {
  calculateLineTotal,
  calculateQuoteTotals,
  formatCurrency,
} from "./quoteCalculations";

describe("quoteCalculations", () => {
  describe("calculateLineTotal", () => {
    it("multiplies quantity by unit price", () => {
      expect(calculateLineTotal(3, 1000)).toBe(3000);
    });

    it("returns 0 when quantity is undefined", () => {
      expect(calculateLineTotal(undefined, 1000)).toBe(0);
    });

    it("returns 0 when unit price is undefined", () => {
      expect(calculateLineTotal(3, undefined)).toBe(0);
    });

    it("returns 0 when both are undefined", () => {
      expect(calculateLineTotal(undefined, undefined)).toBe(0);
    });

    it("handles zero quantity", () => {
      expect(calculateLineTotal(0, 500)).toBe(0);
    });

    it("handles zero unit price", () => {
      expect(calculateLineTotal(5, 0)).toBe(0);
    });

    it("handles decimal quantities", () => {
      expect(calculateLineTotal(1.5, 200)).toBe(300);
    });

    it("handles negative quantity", () => {
      expect(calculateLineTotal(-2, 500)).toBe(-1000);
    });

    it("handles negative unit price", () => {
      expect(calculateLineTotal(3, -100)).toBe(-300);
    });

    it("handles very large values", () => {
      expect(calculateLineTotal(10000, 99999)).toBe(999990000);
    });

    it("handles NaN quantity by treating as 0", () => {
      expect(calculateLineTotal(NaN, 500)).toBe(0);
    });

    it("handles NaN unit price by treating as 0", () => {
      expect(calculateLineTotal(5, NaN)).toBe(0);
    });
  });

  describe("calculateQuoteTotals", () => {
    it("calculates subtotal from line items", () => {
      const items = [
        { quantity: 2, unit_price: 1000 },
        { quantity: 1, unit_price: 500 },
      ];
      const result = calculateQuoteTotals(items, 25, 0);
      expect(result.subtotal).toBe(2500);
    });

    it("calculates VAT correctly", () => {
      const items = [{ quantity: 1, unit_price: 10000 }];
      const result = calculateQuoteTotals(items, 25, 0);
      expect(result.vatAmount).toBe(2500);
      expect(result.total).toBe(12500);
    });

    it("applies discount before VAT", () => {
      const items = [{ quantity: 1, unit_price: 10000 }];
      const result = calculateQuoteTotals(items, 25, 10);
      // 10000 - 10% = 9000, VAT 25% of 9000 = 2250
      expect(result.subtotal).toBe(10000);
      expect(result.discountAmount).toBe(1000);
      expect(result.afterDiscount).toBe(9000);
      expect(result.vatAmount).toBe(2250);
      expect(result.total).toBe(11250);
    });

    it("handles empty line items", () => {
      const result = calculateQuoteTotals([], 25, 0);
      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles 0% VAT", () => {
      const items = [{ quantity: 1, unit_price: 1000 }];
      const result = calculateQuoteTotals(items, 0, 0);
      expect(result.vatAmount).toBe(0);
      expect(result.total).toBe(1000);
    });

    it("handles 100% discount", () => {
      const items = [{ quantity: 1, unit_price: 1000 }];
      const result = calculateQuoteTotals(items, 25, 100);
      expect(result.afterDiscount).toBe(0);
      expect(result.vatAmount).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles items with missing quantity", () => {
      const items = [
        { unit_price: 1000 } as { quantity?: number; unit_price?: number },
      ];
      const result = calculateQuoteTotals(items, 25, 0);
      expect(result.subtotal).toBe(0);
    });

    it("handles items with missing unit_price", () => {
      const items = [
        { quantity: 5 } as { quantity?: number; unit_price?: number },
      ];
      const result = calculateQuoteTotals(items, 25, 0);
      expect(result.subtotal).toBe(0);
    });

    it("handles multiple items with discount and VAT", () => {
      const items = [
        { quantity: 10, unit_price: 500 },
        { quantity: 2, unit_price: 3000 },
        { quantity: 1, unit_price: 1500 },
      ];
      // subtotal = 5000 + 6000 + 1500 = 12500
      // discount 20% = 2500
      // after discount = 10000
      // VAT 25% = 2500
      // total = 12500
      const result = calculateQuoteTotals(items, 25, 20);
      expect(result.subtotal).toBe(12500);
      expect(result.discountAmount).toBe(2500);
      expect(result.afterDiscount).toBe(10000);
      expect(result.vatAmount).toBe(2500);
      expect(result.total).toBe(12500);
    });

    it("handles non-standard VAT rates", () => {
      const items = [{ quantity: 1, unit_price: 10000 }];
      const result = calculateQuoteTotals(items, 12, 0);
      expect(result.vatAmount).toBe(1200);
      expect(result.total).toBe(11200);
    });

    it("handles null lineItems gracefully", () => {
      const result = calculateQuoteTotals(
        null as unknown as { quantity?: number; unit_price?: number }[],
        25,
        0,
      );
      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles undefined lineItems gracefully", () => {
      const result = calculateQuoteTotals(
        undefined as unknown as { quantity?: number; unit_price?: number }[],
        25,
        0,
      );
      expect(result.subtotal).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles items with null values", () => {
      const items = [
        { quantity: null, unit_price: null } as unknown as {
          quantity?: number;
          unit_price?: number;
        },
      ];
      const result = calculateQuoteTotals(items, 25, 0);
      expect(result.subtotal).toBe(0);
    });

    it("handles a single item with large values", () => {
      const items = [{ quantity: 1000, unit_price: 99999 }];
      const result = calculateQuoteTotals(items, 25, 0);
      expect(result.subtotal).toBe(99999000);
      expect(result.vatAmount).toBe(24999750);
      expect(result.total).toBe(124998750);
    });

    it("handles fractional discount percentages", () => {
      const items = [{ quantity: 1, unit_price: 10000 }];
      const result = calculateQuoteTotals(items, 25, 15.5);
      // discount = 10000 * 0.155 = 1550
      // after discount = 8450
      // VAT = 8450 * 0.25 = 2112.5
      // total = 10562.5
      expect(result.discountAmount).toBe(1550);
      expect(result.afterDiscount).toBe(8450);
      expect(result.vatAmount).toBe(2112.5);
      expect(result.total).toBe(10562.5);
    });

    it("handles fractional VAT rates", () => {
      const items = [{ quantity: 1, unit_price: 10000 }];
      const result = calculateQuoteTotals(items, 6.5, 0);
      expect(result.vatAmount).toBe(650);
      expect(result.total).toBe(10650);
    });
  });

  describe("formatCurrency", () => {
    it("formats with two decimal places", () => {
      const result = formatCurrency(1000);
      // sv-SE uses non-breaking space as thousands separator
      expect(result).toMatch(/1[\s\u00a0]?000,00/);
    });

    it("formats zero", () => {
      expect(formatCurrency(0)).toBe("0,00");
    });

    it("formats decimal values", () => {
      const result = formatCurrency(1234.5);
      expect(result).toMatch(/1[\s\u00a0]?234,50/);
    });

    it("rounds to two decimal places", () => {
      const result = formatCurrency(99.999);
      expect(result).toMatch(/100,00/);
    });

    it("formats negative values", () => {
      const result = formatCurrency(-1500.5);
      // sv-SE uses Unicode minus sign (U+2212) instead of hyphen-minus
      expect(result).toMatch(/[\u2212-]1[\s\u00a0]?500,50/);
    });

    it("formats large numbers with thousands separators", () => {
      const result = formatCurrency(1234567.89);
      expect(result).toMatch(/1[\s\u00a0]?234[\s\u00a0]?567,89/);
    });

    it("formats very small decimals", () => {
      const result = formatCurrency(0.01);
      expect(result).toBe("0,01");
    });

    it("formats values with trailing zeros", () => {
      const result = formatCurrency(50);
      expect(result).toBe("50,00");
    });
  });
});
