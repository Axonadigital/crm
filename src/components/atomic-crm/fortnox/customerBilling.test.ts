import { describe, expect, it } from "vitest";

import type { FortnoxInvoice, RecurringRevenueDeal } from "../types";
import {
  buildCustomerBillingOverview,
  getBillingStatus,
  getNextInvoiceDate,
} from "./customerBilling";

const deal = (
  overrides: Partial<RecurringRevenueDeal>,
): RecurringRevenueDeal => ({
  id: 1,
  name: "SEO-avtal",
  company_id: 10,
  company_name: "Axona Kund AB",
  billing_company_id: null,
  billing_company_name: null,
  amount: 0,
  recurring_amount: 12000,
  recurring_interval: "yearly",
  billing_schedule_type: "standard",
  installment_count: null,
  installment_interval_months: null,
  invoiced_through: null,
  billing_start_date: null,
  ...overrides,
});

const invoice = (overrides: Partial<FortnoxInvoice>): FortnoxInvoice => ({
  document_number: 100,
  company_id: 10,
  deal_id: null,
  quote_id: null,
  customer_number: "1",
  customer_name: "Axona Kund AB",
  organisation_number: null,
  invoice_date: "2026-01-15",
  due_date: "2026-02-14",
  final_pay_date: "2026-02-01",
  currency: "SEK",
  total: 15000,
  total_vat: 3000,
  balance: 0,
  booked: true,
  sent: true,
  cancelled: false,
  invoice_type: null,
  ocr: null,
  reminders: null,
  status: "paid",
  synced_at: "2026-08-01T00:00:00Z",
  ...overrides,
});

describe("customer billing overview", () => {
  it("calculates paid, invoiced and remaining amounts for the current year", () => {
    const rows = buildCustomerBillingOverview(
      [deal({})],
      [
        invoice({ total: 15000, total_vat: 3000 }),
        invoice({
          document_number: 101,
          invoice_date: "2025-12-20",
          total: 15000,
          total_vat: 3000,
        }),
      ],
      new Date("2026-08-12T12:00:00"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      expected_yearly: 12000,
      invoiced_year_to_date: 12000,
      paid_year_to_date: 12000,
      remaining_to_invoice_this_year: 0,
      last_invoice_date: "2026-01-15",
      next_invoice_date: "2027-01-15",
      next_invoice_amount: 12000,
      billing_status: "ok",
      billing_confidence: "high",
    });
  });

  it("marks customers without invoices and keeps their full yearly amount remaining", () => {
    const rows = buildCustomerBillingOverview(
      [deal({ recurring_amount: 3000, recurring_interval: "quarterly" })],
      [],
      new Date("2026-08-12T12:00:00"),
    );

    expect(rows[0]).toMatchObject({
      monthly_recurring: 1000,
      expected_yearly: 12000,
      remaining_to_invoice_this_year: 12000,
      billing_status: "never_invoiced",
    });
  });

  it("treats a manual 'invoiced through' date as the authority for remaining and next invoice", () => {
    // Z-bud case: monthly deal, no matched Fortnox invoices, but prepaid for
    // the rest of the year. The hand-set date must zero out the remaining.
    const rows = buildCustomerBillingOverview(
      [
        deal({
          recurring_amount: 1000,
          recurring_interval: "monthly",
          invoiced_through: "2026-12-31",
        }),
      ],
      [],
      new Date("2026-08-12T12:00:00"),
    );

    expect(rows[0]).toMatchObject({
      monthly_recurring: 1000,
      expected_yearly: 12000,
      remaining_to_invoice_this_year: 0,
      next_invoice_date: "2027-01-01",
      billing_status: "ok",
      has_manual_schedule: true,
    });
  });

  it("leaves only the uncovered months to invoice when covered mid-year", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          recurring_amount: 1000,
          recurring_interval: "monthly",
          invoiced_through: "2026-06-30",
        }),
      ],
      [],
      new Date("2026-08-12T12:00:00"),
    );

    // Covered through June (6 months) -> 6 months left at 1000 = 6000.
    expect(rows[0].remaining_to_invoice_this_year).toBe(6000);
    expect(rows[0].next_invoice_date).toBe("2026-07-01");
    expect(rows[0].billing_status).toBe("overdue");
  });

  it("infers prepaid recurring coverage after subtracting one-time deal value", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          amount: 30000,
          recurring_amount: 1000,
          recurring_interval: "monthly",
        }),
      ],
      [
        invoice({
          invoice_date: "2026-08-08",
          due_date: "2026-09-07",
          total: 43750,
          total_vat: 8750,
          balance: 0,
          status: "paid",
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0]).toMatchObject({
      paid_year_to_date: 35000,
      remaining_to_invoice_this_year: 0,
      next_invoice_date: "2027-01-01",
      billing_status: "ok",
    });
  });

  it("uses Fortnox invoice rows to separate recurring coverage from unrelated one-time invoices", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 64,
          amount: 30000,
          recurring_amount: 1000,
          recurring_interval: "monthly",
        }),
        deal({
          id: 65,
          name: "Google Business Profil",
          amount: 3000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [
        invoice({
          document_number: 2642,
          invoice_date: "2026-07-10",
          due_date: "2026-08-09",
          total: 43750,
          total_vat: 8750,
          balance: 0,
          status: "paid",
          invoice_rows: [
            {
              Description: "Hemsida + fraksedelssystem",
              PriceExcludingVAT: 30000,
              DeliveredQuantity: "1",
              TotalExcludingVAT: 30000,
            },
            {
              Description: "Löpande drift & underhåll/ Månad",
              PriceExcludingVAT: 1000,
              DeliveredQuantity: "5",
              TotalExcludingVAT: 5000,
            },
          ],
        }),
        invoice({
          document_number: 2644,
          invoice_date: "2026-08-11",
          due_date: "2026-09-10",
          total: 3750,
          total_vat: 750,
          balance: 3750,
          status: "unpaid",
          invoice_rows: [
            {
              Description: "Google Business Profil",
              PriceExcludingVAT: 1500,
              DeliveredQuantity: "2",
              TotalExcludingVAT: 3000,
            },
          ],
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0]).toMatchObject({
      paid_year_to_date: 35000,
      next_invoice_date: "2027-01-01",
      next_invoice_amount: 1000,
      billing_confidence: "high",
    });
  });

  it("normalises unpaid balances to ex VAT", () => {
    const rows = buildCustomerBillingOverview(
      [deal({ recurring_amount: 1000, recurring_interval: "monthly" })],
      [
        invoice({
          total: 1250,
          total_vat: 250,
          balance: 625,
          status: "unpaid",
        }),
      ],
      new Date("2026-01-20T12:00:00"),
    );

    expect(rows[0].outstanding_balance).toBe(500);
  });

  it("reminds about won one-time deals that have no matching Fortnox invoice", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 30,
          name: "Startsida",
          amount: 10000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      monthly_recurring: 0,
      next_invoice_date: "2026-08-13",
      next_invoice_amount: 10000,
      billing_status: "due_soon",
      billing_confidence: "needs_review",
      next_invoice_deals: [
        expect.objectContaining({
          deal_id: 30,
          deal_name: "Startsida",
          amount: 10000,
        }),
      ],
      deals: [
        expect.objectContaining({
          deal_id: 30,
          status: "needs_invoice",
          next_invoice_amount: 10000,
        }),
      ],
    });
    expect(rows[0].billing_warnings[0]).toContain(
      "saknar matchande Fortnox-faktura",
    );
  });

  it("does not remind about a won one-time deal when Fortnox has a matching invoice row", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 31,
          name: "Startsida",
          amount: 10000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [
        invoice({
          total: 12500,
          total_vat: 2500,
          invoice_rows: [
            {
              Description: "Startsida",
              TotalExcludingVAT: 10000,
            },
          ],
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0].billing_confidence).toBe("high");
    expect(rows[0].billing_warnings).toEqual([]);
    expect(rows[0].next_invoice_date).toBeNull();
    expect(rows[0].billing_status).toBe("fully_invoiced");
    expect(rows[0].deals[0]).toMatchObject({
      deal_id: 31,
      status: "ok",
      next_invoice_amount: 0,
    });
  });

  it("flags an overdue unpaid invoice even when the deal itself is fully_invoiced", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 33,
          name: "Hemsida Ensidig",
          amount: 5000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [
        invoice({
          total: 6250,
          total_vat: 1250,
          balance: 6250,
          status: "overdue",
          sent: false,
        }),
      ],
      new Date("2026-08-15T12:00:00"),
    );

    expect(rows[0].billing_status).toBe("fully_invoiced");
    expect(rows[0].has_overdue_invoice).toBe(true);
    expect(rows[0].overdue_invoice_amount).toBe(5000);
  });

  it("matches a one-time deal to its invoice despite a negotiated discount, when there's no ambiguity", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 62,
          name: "A Jonasson Byggservice AB",
          amount: 6500,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [
        invoice({
          document_number: 2638,
          total: 7500,
          total_vat: 1500,
          balance: 0,
          status: "paid",
          invoice_rows: [{ Description: "Hemsida", TotalExcludingVAT: 6000 }],
        }),
      ],
      new Date("2026-08-15T12:00:00"),
    );

    expect(rows[0].billing_warnings).toEqual([]);
    expect(rows[0].deals[0]).toMatchObject({ deal_id: 62, status: "ok" });
  });

  it("does not fall back to ambiguity-free matching when a second deal could equally claim the invoice", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 40,
          name: "ppp plåtservice",
          amount: 7000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
        deal({
          id: 47,
          name: "Loopia-deal",
          amount: 2160,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [
        invoice({
          document_number: 3001,
          total: 8750,
          total_vat: 1750,
          invoice_rows: [
            { Description: "Plåtarbete", TotalExcludingVAT: 7000 },
          ],
        }),
      ],
      new Date("2026-08-15T12:00:00"),
    );

    const byId = (id: number) =>
      rows[0].deals.find((d) => String(d.deal_id) === String(id));
    // Deal 40 is claimed by the invoice and must not be told to send another
    // one — a pre-existing "multiple deals share this invoice recipient"
    // warning still marks it needs_review rather than a clean "ok", which is
    // a separate, unrelated mechanism.
    expect(byId(40)?.status).not.toBe("needs_invoice");
    expect(byId(47)).toMatchObject({ status: "needs_invoice" });
  });

  it("counts an uninvoiced one-time deal as money left to invoice this year", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 70,
          name: "Hemsida",
          amount: 5000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [],
      new Date("2026-08-15T12:00:00"),
    );

    // The recommendation and the column must agree — previously this said
    // "Skicka faktura 5 000 kr" beside "0 kr kvar att fakturera".
    expect(rows[0].next_invoice_amount).toBe(5000);
    expect(rows[0].remaining_to_invoice_this_year).toBe(5000);
  });

  it("keeps unpaid balances visible after the calendar year turns", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 71,
          amount: 5000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [
        invoice({
          invoice_date: "2025-11-10",
          due_date: "2025-12-10",
          total: 6250,
          total_vat: 1250,
          balance: 6250,
          status: "overdue",
        }),
      ],
      new Date("2026-08-15T12:00:00"),
    );

    expect(rows[0].paid_year_to_date).toBe(0);
    expect(rows[0].outstanding_balance).toBe(5000);
    expect(rows[0].has_overdue_invoice).toBe(true);
  });

  it("does not invent a recurring schedule from a one-time deal's invoice", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 57,
          name: "Tullus Hemsida",
          amount: 8000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
        deal({
          id: 66,
          name: "Tullus SEO hantering",
          amount: 0,
          recurring_amount: 499,
          recurring_interval: null,
          billing_start_date: null,
          invoiced_through: null,
        }),
      ],
      [
        invoice({
          document_number: 2629,
          invoice_date: "2026-06-03",
          total: 10000,
          total_vat: 2000,
          balance: 0,
          status: "paid",
          invoice_rows: [{ Description: "Hemsida", TotalExcludingVAT: 8000 }],
        }),
      ],
      new Date("2026-08-15T12:00:00"),
    );

    // The website invoice says nothing about when the SEO subscription began,
    // so no schedule may be derived from it.
    const seo = rows[0].deals.find((d) => String(d.deal_id) === "66");
    expect(seo?.next_invoice_date).toBeNull();
    expect(rows[0].billing_warnings.join(" ")).toContain("saknar startdatum");
    expect(rows[0].billing_status).not.toBe("fully_invoiced");
  });

  it("still anchors a recurring schedule to the last invoice when nothing else could have produced it", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 72,
          amount: 0,
          recurring_amount: 1000,
          recurring_interval: "monthly",
        }),
      ],
      [
        invoice({
          invoice_date: "2026-07-10",
          total: 1250,
          total_vat: 250,
          balance: 0,
          status: "paid",
        }),
      ],
      new Date("2026-08-15T12:00:00"),
    );

    expect(rows[0].billing_warnings).toEqual([]);
    expect(rows[0].next_invoice_date).toBe("2026-08-10");
  });

  it("does not mark an unbilled one-time deal as fully_invoiced (it needs a first invoice instead)", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 32,
          name: "Startsida",
          amount: 10000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0].billing_status).not.toBe("fully_invoiced");
    expect(rows[0].deals[0]).toMatchObject({
      deal_id: 32,
      status: "needs_invoice",
    });
  });

  it("recommends the next installment for a fixed deal split into payments", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 40,
          name: "Nyhetsbrev",
          amount: 15000,
          recurring_amount: 0,
          recurring_interval: null,
          billing_schedule_type: "installment",
          installment_count: 3,
          installment_interval_months: 1,
          billing_start_date: "2026-08-01",
        }),
      ],
      [
        invoice({
          document_number: 401,
          invoice_date: "2026-08-01",
          total: 6250,
          total_vat: 1250,
          invoice_rows: [
            {
              Description: "Nyhetsbrev delbetalning 1",
              TotalExcludingVAT: 5000,
            },
          ],
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0]).toMatchObject({
      billing_cadence: "installment",
      next_invoice_date: "2026-09-01",
      next_invoice_amount: 5000,
      billing_confidence: "needs_review",
      deals: [
        expect.objectContaining({
          deal_id: 40,
          billing_schedule_type: "installment",
          installment_index: 2,
          installment_count: 3,
          next_invoice_amount: 5000,
          status: "needs_invoice",
        }),
      ],
    });
    expect(rows[0].billing_warnings[0]).toContain("Delbetalning kvar");
  });

  it("groups recurring coverage by the company that receives the invoice", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 20,
          company_id: 20,
          company_name: "Leveransbolaget AB",
          billing_company_id: 10,
          billing_company_name: "Betalande Kund AB",
          recurring_amount: 3000,
          recurring_interval: "monthly",
        }),
      ],
      [
        invoice({
          company_id: 10,
          customer_name: "Betalande Kund AB",
          total: 3750,
          total_vat: 750,
        }),
      ],
      new Date("2026-01-20T12:00:00"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      company_id: 10,
      company_name: "Betalande Kund AB",
      monthly_recurring: 3000,
      invoiced_year_to_date: 3000,
      paid_year_to_date: 3000,
      next_invoice_amount: 3000,
      next_invoice_deals: [
        expect.objectContaining({
          deal_id: 20,
          deal_name: "SEO-avtal",
          company_id: 20,
          company_name: "Leveransbolaget AB",
          amount: 3000,
        }),
      ],
    });
  });

  it("surfaces an overdue recurring line instead of a merely-due-soon installment", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 50,
          name: "Löpande SEO",
          amount: 0,
          recurring_amount: 1000,
          recurring_interval: "monthly",
          invoiced_through: "2026-06-30", // covered through June -> overdue in August
        }),
        deal({
          id: 51,
          name: "Nyhetsbrev",
          amount: 9000,
          recurring_amount: 0,
          recurring_interval: null,
          billing_schedule_type: "installment",
          installment_count: 3,
          installment_interval_months: 1,
          billing_start_date: "2026-09-01", // next installment due next month, not yet
        }),
      ],
      [],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0].billing_status).toBe("overdue");
    expect(rows[0].next_invoice_date).toBe("2026-07-01");
    expect(rows[0].next_invoice_deals).toEqual([
      expect.objectContaining({ deal_id: 50 }),
    ]);
  });

  it("combines a missing one-time deal with an overdue recurring line instead of picking only one", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 52,
          name: "Löpande SEO",
          amount: 0,
          recurring_amount: 1000,
          recurring_interval: "monthly",
          invoiced_through: "2026-06-30",
        }),
        deal({
          id: 53,
          name: "Startsida",
          amount: 5000,
          recurring_amount: 0,
          recurring_interval: null,
        }),
      ],
      [],
      new Date("2026-08-13T12:00:00"),
    );

    const dealIds = rows[0].next_invoice_deals.map((d) => d.deal_id).sort();
    expect(dealIds).toEqual([52, 53]);
    expect(rows[0].next_invoice_amount).toBe(6000);
  });

  it("reminds about the one-time portion of a combo deal even though it also recurs", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 54,
          name: "Startpaket + drift",
          amount: 10000,
          recurring_amount: 2000,
          recurring_interval: "monthly",
        }),
      ],
      [],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0].billing_warnings.join(" ")).toContain(
      "saknar matchande Fortnox-faktura",
    );
    expect(rows[0].deals.find((d) => d.deal_id === 54)).toMatchObject({
      status: "needs_invoice",
    });
  });

  it("does not count an invoice linked to a different deal as an installment payment", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 55,
          name: "Nyhetsbrev",
          amount: 15000,
          recurring_amount: 0,
          recurring_interval: null,
          billing_schedule_type: "installment",
          installment_count: 3,
          installment_interval_months: 1,
          billing_start_date: "2026-08-01",
        }),
      ],
      [
        invoice({
          document_number: 500,
          deal_id: 999, // linked to an unrelated deal
          invoice_date: "2026-08-01",
          total: 6250,
          total_vat: 1250,
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0].deals[0]).toMatchObject({
      installment_index: 1,
      status: "needs_invoice",
    });
  });

  it("does not count a stale invoice from before the deal's billing start as an installment payment", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 56,
          name: "Nyhetsbrev",
          amount: 15000,
          recurring_amount: 0,
          recurring_interval: null,
          billing_schedule_type: "installment",
          installment_count: 3,
          installment_interval_months: 1,
          billing_start_date: "2026-08-01",
        }),
      ],
      [
        // Same amount as one installment (5000), but dated before the deal
        // even started — an unrelated, coincidentally-equal invoice.
        invoice({
          document_number: 501,
          deal_id: null,
          invoice_date: "2026-05-01",
          total: 6250,
          total_vat: 1250,
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0].deals[0]).toMatchObject({
      installment_index: 1,
      status: "needs_invoice",
    });
  });

  it("recommends the final installment's remainder-adjusted amount so the sum matches the deal total", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({
          id: 57,
          name: "Kampanj",
          amount: 10000,
          recurring_amount: 0,
          recurring_interval: null,
          billing_schedule_type: "installment",
          installment_count: 3,
          installment_interval_months: 1,
          billing_start_date: "2026-01-01",
        }),
      ],
      [
        invoice({
          document_number: 502,
          deal_id: 57,
          invoice_date: "2026-01-01",
          total: 4166.665,
          total_vat: 833.335,
        }),
        invoice({
          document_number: 503,
          deal_id: 57,
          invoice_date: "2026-02-01",
          total: 4166.665,
          total_vat: 833.335,
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    // Two installments of 3333.33 already invoiced; the third must absorb the
    // 0.01 rounding remainder so 3333.33 + 3333.33 + 3333.34 = 10000.00.
    expect(rows[0].deals[0].next_invoice_amount).toBe(3333.34);
  });

  it("flags multi-deal customers when Fortnox invoices are not linked to deals", () => {
    const rows = buildCustomerBillingOverview(
      [
        deal({ id: 1, amount: 30000, recurring_amount: 1000 }),
        deal({ id: 2, name: "Businessprofil", amount: 3000 }),
      ],
      [
        invoice({
          total: 43750,
          total_vat: 8750,
          deal_id: null,
          invoice_rows: [],
        }),
      ],
      new Date("2026-08-13T12:00:00"),
    );

    expect(rows[0].billing_confidence).toBe("needs_review");
    expect(rows[0].billing_warnings[0]).toContain(
      "Flera deals delar fakturamottagare",
    );
  });
});

describe("next invoice dates", () => {
  it("adds one billing interval to the last invoice date", () => {
    expect(
      getNextInvoiceDate({
        lastInvoiceDate: "2026-03-31",
        interval: "quarterly",
      }),
    ).toBe("2026-06-30");
  });

  it("classifies due dates", () => {
    const today = new Date("2026-08-12T12:00:00");

    expect(getBillingStatus(null, today)).toBe("never_invoiced");
    expect(getBillingStatus("2026-08-01", today)).toBe("overdue");
    expect(getBillingStatus("2026-08-30", today)).toBe("due_soon");
    expect(getBillingStatus("2026-10-01", today)).toBe("ok");
  });
});
