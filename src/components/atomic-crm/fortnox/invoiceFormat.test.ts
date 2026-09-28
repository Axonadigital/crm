import { describe, expect, it } from "vitest";

import {
  daysOverdue,
  exVatAmount,
  isUnsentAndActionable,
} from "./invoiceFormat";

describe("exVatAmount", () => {
  // The mirror never gets `total_vat` from Fortnox's list endpoint, so the
  // 25% fallback is what actually runs in production. Verified against the
  // live tenant: every invoice divided by 1.25 lands exactly on the ex-VAT
  // deal amount (6 250 ink → 5 000 ex).
  it("assumes 25% VAT when the VAT amount is missing", () => {
    expect(exVatAmount(6250)).toBe(5000);
    expect(exVatAmount(6250, null)).toBe(5000);
  });

  it("subtracts the exact VAT amount when Fortnox provides it", () => {
    expect(exVatAmount(6250, 1250)).toBe(5000);
    // A 12% VAT invoice must NOT be divided by 1.25.
    expect(exVatAmount(5600, 600)).toBe(5000);
  });

  it("handles credit invoices (negative totals)", () => {
    expect(exVatAmount(-12500)).toBe(-10000);
  });

  it("returns 0 for a missing total", () => {
    expect(exVatAmount(null)).toBe(0);
    expect(exVatAmount(undefined)).toBe(0);
  });
});

describe("isUnsentAndActionable", () => {
  // Fortnox's `Sent` flag means "sent through Fortnox", not "the customer got
  // it". On the live tenant, 5 of 7 unsent invoices were fully PAID, because
  // the invoices had been emailed by hand. Showing "not sent" on those was
  // alarming and meaningless.
  it("stays quiet about a paid invoice that Fortnox never sent", () => {
    expect(isUnsentAndActionable({ sent: false, status: "paid" })).toBe(false);
  });

  it("stays quiet about a cancelled invoice", () => {
    expect(isUnsentAndActionable({ sent: false, status: "cancelled" })).toBe(
      false,
    );
  });

  it("flags an unpaid invoice that never went out through Fortnox", () => {
    expect(isUnsentAndActionable({ sent: false, status: "unpaid" })).toBe(true);
    expect(isUnsentAndActionable({ sent: false, status: "overdue" })).toBe(
      true,
    );
  });

  it("stays quiet once the invoice has actually been sent", () => {
    expect(isUnsentAndActionable({ sent: true, status: "overdue" })).toBe(
      false,
    );
    expect(isUnsentAndActionable({ sent: true, status: "unpaid" })).toBe(false);
  });
});

describe("daysOverdue", () => {
  const today = new Date(2026, 6, 14); // 14 July 2026

  it("counts the days an invoice is late", () => {
    expect(daysOverdue("2026-07-07", today)).toBe(7);
    expect(daysOverdue("2026-04-24", today)).toBe(81);
  });

  it("returns null on the due date itself and before it", () => {
    expect(daysOverdue("2026-07-14", today)).toBeNull();
    expect(daysOverdue("2026-08-01", today)).toBeNull();
  });

  it("returns null when there is no due date", () => {
    expect(daysOverdue(null, today)).toBeNull();
  });
});
