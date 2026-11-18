import { describe, expect, it } from "vitest";
import {
  buildCreateRecurringPayload,
  nextRecurringStartDate,
  recurringRowText,
  invoiceDetailOps,
  personName,
  recurringInvoiceDetails,
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

describe("recurringRowText", () => {
  it("names the row after what the customer pays for, per period", () => {
    // The row text is printed on every invoice the customer receives, so it
    // must describe the service, not echo an internal deal name like "Hemsida".
    expect(recurringRowText("monthly")).toBe("Löpande underhåll / månad");
    expect(recurringRowText("quarterly")).toBe("Löpande underhåll / kvartal");
    expect(recurringRowText("yearly")).toBe("Löpande underhåll / 12 månader");
  });

  it("falls back to monthly like the cadence rule does", () => {
    expect(recurringRowText(null)).toBe("Löpande underhåll / månad");
  });
});

describe("buildCreateRecurringPayload", () => {
  it("prints the references and email on every generated invoice", () => {
    const payload = buildCreateRecurringPayload({
      ...base,
      details: recurringInvoiceDetails({
        ourReference: "Rasmus Jönsson",
        yourReference: "Patrick Sundqvist",
        invoiceEmail: "info@z-bud.se",
      }),
    });
    expect(payload.our_reference).toBe("Rasmus Jönsson");
    expect(payload.your_reference).toBe("Patrick Sundqvist");
    expect(payload.distribution_method).toBe("EMAIL");
    expect(payload.email).toEqual({ to: "info@z-bud.se" });
  });

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
    expect(payload.payment_terms).toBe("30");
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

describe("personName", () => {
  it("joins first and last name and skips placeholders", () => {
    expect(personName("Rasmus", "Jönsson")).toBe("Rasmus Jönsson");
    expect(personName("Patrick", null)).toBe("Patrick");
    // Unconfirmed sales users are stored as "Pending Pending" — printing that
    // as Vår referens on a customer invoice is worse than leaving it out.
    expect(personName("Pending", "Pending")).toBeNull();
    expect(personName(" ", null)).toBeNull();
  });
});

describe("recurringInvoiceDetails", () => {
  it("carries the same references, terms and email as our manual invoices", () => {
    expect(
      recurringInvoiceDetails({
        ourReference: "Rasmus Jönsson",
        yourReference: "Patrick Sundqvist",
        invoiceEmail: "info@z-bud.se",
      }),
    ).toEqual({
      our_reference: "Rasmus Jönsson",
      your_reference: "Patrick Sundqvist",
      payment_terms: "30",
      distribution_method: "EMAIL",
      email: { to: "info@z-bud.se" },
    });
  });

  it("leaves out what the CRM does not know instead of sending blanks", () => {
    expect(recurringInvoiceDetails({ ourReference: "Isak Persson" })).toEqual({
      our_reference: "Isak Persson",
      payment_terms: "30",
    });
  });
});

describe("invoiceDetailOps", () => {
  it("uses add so empty fields on an existing recurring can be filled", () => {
    // RFC 6902 replace fails on a member that is absent; add sets or overwrites.
    expect(
      invoiceDetailOps({
        our_reference: "Rasmus Jönsson",
        payment_terms: "30",
        email: { to: "a@b.se" },
      }),
    ).toEqual([
      { op: "add", path: "/our_reference", value: "Rasmus Jönsson" },
      { op: "add", path: "/payment_terms", value: "30" },
      { op: "add", path: "/email", value: { to: "a@b.se" } },
    ]);
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

describe("nextRecurringStartDate", () => {
  const today = new Date("2026-08-18T12:00:00Z");

  it("resumes the day after the period already invoiced", () => {
    // Löfvenius: billed through 1 September, so the recurring must start the
    // 2nd — starting from billing_start_date (15 July) would re-bill periods
    // the customer has already paid for.
    expect(
      nextRecurringStartDate({
        invoicedThrough: "2026-09-01",
        billingStartDate: "2026-07-15",
        today,
      }),
    ).toEqual({ startDate: "2026-09-02", inThePast: false });
  });

  it("uses the billing start date when nothing has been invoiced yet", () => {
    expect(
      nextRecurringStartDate({
        invoicedThrough: null,
        billingStartDate: "2026-09-01",
        today,
      }),
    ).toEqual({ startDate: "2026-09-01", inThePast: false });
  });

  it("flags a deal that is behind instead of skipping its unbilled periods", () => {
    // Billed only through 25 June: those months are genuinely owed, so the date
    // stands — but activation could generate them at once, hence the flag.
    expect(
      nextRecurringStartDate({
        invoicedThrough: "2026-06-25",
        billingStartDate: "2026-03-18",
        today,
      }),
    ).toEqual({ startDate: "2026-06-26", inThePast: true });
  });

  it("falls back to today when the deal carries no dates at all", () => {
    expect(nextRecurringStartDate({ today })).toEqual({
      startDate: "2026-08-18",
      inThePast: false,
    });
  });
});
