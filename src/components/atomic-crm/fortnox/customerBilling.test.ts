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
  amount: 0,
  recurring_amount: 12000,
  recurring_interval: "yearly",
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
      billing_status: "ok",
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
