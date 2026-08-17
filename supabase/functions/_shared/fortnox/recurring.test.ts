import { describe, expect, it } from "vitest";
import {
  buildCreateRecurringPayload,
  recurringRuleFor,
  replaceOps,
  RECURRINGS_PATH,
} from "./recurring.ts";

describe("recurringRuleFor", () => {
  it("expresses every cadence we sell as a month interval", () => {
    // Fortnox only accepts MONTH or WEEK, so quarterly and yearly are month
    // intervals rather than frequencies of their own.
    expect(recurringRuleFor("monthly")).toEqual({
      interval: 1,
      frequency: "MONTH",
    });
    expect(recurringRuleFor("quarterly")).toEqual({
      interval: 3,
      frequency: "MONTH",
    });
    expect(recurringRuleFor("yearly")).toEqual({
      interval: 12,
      frequency: "MONTH",
    });
  });

  it("falls back to monthly when the deal has no interval set", () => {
    expect(recurringRuleFor(null)).toEqual({ interval: 1, frequency: "MONTH" });
    expect(recurringRuleFor(undefined)).toEqual({
      interval: 1,
      frequency: "MONTH",
    });
  });
});

describe("buildCreateRecurringPayload", () => {
  const base = {
    customerNumber: "1234",
    description: "SEO hantering",
    price: 499,
    interval: "monthly" as const,
    startDate: "2026-09-01",
  };

  it("builds a payload that cannot bill anyone until someone activates it", () => {
    const payload = buildCreateRecurringPayload(base);

    // The safety property this whole flow rests on: MANUAL means "nothing is
    // generated automatically", so the record is reviewable in Fortnox first.
    expect(payload.invoice_handling).toBe("MANUAL");
    expect(payload.customer).toEqual({ number: "1234" });
    expect(payload.dates.dates).toEqual({
      invoice_processing_date: "2026-09-01",
      period_start_date: "2026-09-01",
    });
    expect(payload.dates.rules).toEqual({ interval: 1, frequency: "MONTH" });
    expect(payload.rows).toEqual([
      {
        type: "SERVICE",
        description: "SEO hantering",
        quantity: 1,
        price: 499,
        account_number: 3001,
        vat_percentage: 25,
      },
    ]);
    expect(payload.currency).toBe("SEK");
  });

  it("allows an explicit handling so activation can reuse the same builder", () => {
    expect(
      buildCreateRecurringPayload({ ...base, invoiceHandling: "AUTOMATIC" })
        .invoice_handling,
    ).toBe("AUTOMATIC");
  });

  it("refuses input that would create a broken recurring in Fortnox", () => {
    expect(() =>
      buildCreateRecurringPayload({ ...base, customerNumber: "" }),
    ).toThrow(/customer/i);
    expect(() => buildCreateRecurringPayload({ ...base, price: 0 })).toThrow(
      /amount/i,
    );
    expect(() =>
      buildCreateRecurringPayload({ ...base, startDate: "2026-9-1" }),
    ).toThrow(/start date/i);
  });

  it("names a row rather than sending an empty description", () => {
    expect(
      buildCreateRecurringPayload({ ...base, description: "   " }).rows[0]
        .description,
    ).toBe("Tjänst");
  });
});

describe("replaceOps", () => {
  it("builds JSON Patch operations with rooted paths", () => {
    expect(
      replaceOps({ status: "ACTIVE", invoice_handling: "AUTOMATIC" }),
    ).toEqual([
      { op: "replace", path: "/status", value: "ACTIVE" },
      { op: "replace", path: "/invoice_handling", value: "AUTOMATIC" },
    ]);
  });
});

describe("RECURRINGS_PATH", () => {
  it("targets the new recurring-billing API, not the legacy /3/contracts", () => {
    expect(RECURRINGS_PATH).toBe("/api/recurring-billing/recurrings-v1");
    expect(RECURRINGS_PATH).not.toContain("/3/");
  });
});
