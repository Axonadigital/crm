import { describe, expect, it } from "vitest";

import { mapSupplierInvoice } from "./supplierInvoices.ts";

const NOW = "2026-07-16T12:00:00.000Z";

describe("mapSupplierInvoice", () => {
  it("maps a complete list item", () => {
    const row = mapSupplierInvoice(
      {
        GivenNumber: 101,
        SupplierNumber: "42",
        SupplierName: "Loopia AB",
        InvoiceNumber: "INV-2026-0042",
        InvoiceDate: "2026-07-01",
        DueDate: "2026-07-31",
        FinalPayDate: "",
        Currency: "SEK",
        Total: "1250.00",
        VAT: "250.00",
        Balance: "1250.00",
        Booked: true,
        Cancelled: false,
        Credit: false,
      },
      NOW,
    );

    expect(row).toMatchObject({
      given_number: 101,
      supplier_number: "42",
      supplier_name: "Loopia AB",
      invoice_number: "INV-2026-0042",
      invoice_date: "2026-07-01",
      due_date: "2026-07-31",
      final_pay_date: null,
      total: 1250,
      vat: 250,
      balance: 1250,
      booked: true,
      cancelled: false,
      credit: false,
      synced_at: NOW,
    });
  });

  it("returns null without a GivenNumber — the row has no identity", () => {
    expect(mapSupplierInvoice({ SupplierName: "X" }, NOW)).toBeNull();
  });

  // Fortnox has used both flag names across API versions.
  it("accepts Cancel as well as Cancelled", () => {
    expect(
      mapSupplierInvoice({ GivenNumber: 1, Cancel: true }, NOW)?.cancelled,
    ).toBe(true);
    expect(
      mapSupplierInvoice({ GivenNumber: 1, Cancelled: true }, NOW)?.cancelled,
    ).toBe(true);
    expect(mapSupplierInvoice({ GivenNumber: 1 }, NOW)?.cancelled).toBe(false);
  });

  it("normalises string booleans and missing amounts", () => {
    const row = mapSupplierInvoice(
      { GivenNumber: 2, Booked: "true", Credit: "false", Total: "" },
      NOW,
    );
    expect(row).toMatchObject({ booked: true, credit: false, total: null });
  });
});
