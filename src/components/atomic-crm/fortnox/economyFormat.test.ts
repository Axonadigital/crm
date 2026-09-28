import { describe, expect, it } from "vitest";

import { classifyRecurring, estimatedMonthlyCost } from "./economyFormat";

describe("classifyRecurring", () => {
  it("flags a same-amount-every-month supplier as a subscription", () => {
    expect(
      classifyRecurring({ avg_total: 500, min_total: 500, max_total: 500 }),
    ).toBe("subscription");
  });

  it("tolerates öres-rounding and small plan changes (within 20%)", () => {
    expect(
      classifyRecurring({ avg_total: 500, min_total: 475, max_total: 545 }),
    ).toBe("subscription");
  });

  it("flags usage-based billing as variable", () => {
    expect(
      classifyRecurring({ avg_total: 1000, min_total: 200, max_total: 3200 }),
    ).toBe("variable");
  });

  it("never divides by a zero average", () => {
    expect(
      classifyRecurring({ avg_total: 0, min_total: 0, max_total: 0 }),
    ).toBe("variable");
  });
});

describe("estimatedMonthlyCost", () => {
  it("a monthly subscription costs the invoice amount per month", () => {
    expect(
      estimatedMonthlyCost({
        avg_total: 500,
        invoice_count: 5,
        first_invoice_date: "2026-01-15",
        last_invoice_date: "2026-05-15",
      }),
    ).toBe(500);
  });

  // Quarterly: 3 invoices in Jan/Apr/Jul → gap 3 months → a third per month.
  it("spreads a quarterly invoice over its three months", () => {
    expect(
      estimatedMonthlyCost({
        avg_total: 900,
        invoice_count: 3,
        first_invoice_date: "2026-01-10",
        last_invoice_date: "2026-07-10",
      }),
    ).toBe(300);
  });

  it("falls back to the invoice amount when dates are missing", () => {
    expect(
      estimatedMonthlyCost({
        avg_total: 250,
        invoice_count: 4,
        first_invoice_date: null,
        last_invoice_date: null,
      }),
    ).toBe(250);
  });
});
