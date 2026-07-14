import { describe, expect, it } from "vitest";

import { daysOverdue, isUnsentAndActionable } from "./invoiceFormat";

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
