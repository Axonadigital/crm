import { describe, expect, it } from "vitest";
import {
  dealReference,
  deriveStatus,
  formatLastModified,
  mapInvoice,
  normalizeOrgNumber,
  parseDealReference,
  parseQuoteReference,
  quoteReference,
  toNumber,
} from "./invoices.ts";

const NOW = "2026-07-14T10:00:00.000Z";
const TODAY = "2026-07-14";

/** Shaped exactly like a row from the live tenant. */
const paidInvoice = {
  DocumentNumber: "2603",
  CustomerNumber: "12",
  CustomerName: "Exempelbolaget AB",
  OrganisationNumber: "559900-1234",
  InvoiceDate: "2026-04-03",
  DueDate: "2026-04-17",
  FinalPayDate: "2026-04-17",
  Currency: "SEK",
  Total: 8875,
  TotalVAT: 1775,
  Balance: 0,
  Booked: false,
  Sent: false,
  Cancelled: false,
  InvoiceType: "INVOICE",
  OCR: "123456789",
  Reminders: 0,
};

describe("mapInvoice", () => {
  it("normalises Fortnox's mixed number/string types", () => {
    const row = mapInvoice(paidInvoice, NOW)!;

    expect(row.document_number).toBe(2603);
    expect(row.total).toBe(8875);
    expect(row.balance).toBe(0);
    expect(row.customer_number).toBe("12");
    expect(row.synced_at).toBe(NOW);
  });

  it("turns Fortnox's empty strings into nulls", () => {
    const row = mapInvoice(
      { ...paidInvoice, FinalPayDate: "", OCR: "", Currency: "" },
      NOW,
    )!;

    expect(row.final_pay_date).toBeNull();
    expect(row.ocr).toBeNull();
    expect(row.currency).toBeNull();
  });

  it("skips a row with no document number rather than writing a broken mirror", () => {
    expect(mapInvoice({ CustomerName: "Ingen" }, NOW)).toBeNull();
  });

  it("keeps the raw payload so a mapping mistake is recoverable", () => {
    expect(mapInvoice(paidInvoice, NOW)!.raw).toEqual(paidInvoice);
  });

  it("merges invoice detail rows and exact VAT from the detail endpoint", () => {
    const row = mapInvoice(
      { ...paidInvoice, TotalVAT: undefined },
      NOW,
      {
        ...paidInvoice,
        TotalVAT: 1775,
        InvoiceRows: [{ Description: "Hemsida", Price: 30000 }],
      },
    )!;

    expect(row.total_vat).toBe(1775);
    expect(row.invoice_rows).toEqual([
      { Description: "Hemsida", Price: 30000 },
    ]);
    expect(row.detail_raw?.InvoiceRows).toHaveLength(1);
  });
});

describe("deriveStatus", () => {
  it("treats a zero balance as paid — verified against the live tenant", () => {
    expect(
      deriveStatus(
        { cancelled: false, balance: 0, due_date: "2026-04-17" },
        TODAY,
      ),
    ).toBe("paid");
  });

  it("flags an unpaid invoice past its due date as overdue", () => {
    expect(
      deriveStatus(
        { cancelled: false, balance: 5000, due_date: "2026-04-24" },
        TODAY,
      ),
    ).toBe("overdue");
  });

  it("keeps an unpaid invoice that is not yet due as unpaid", () => {
    expect(
      deriveStatus(
        { cancelled: false, balance: 6250, due_date: "2026-08-01" },
        TODAY,
      ),
    ).toBe("unpaid");
  });

  it("is not overdue on the due date itself", () => {
    expect(
      deriveStatus({ cancelled: false, balance: 100, due_date: TODAY }, TODAY),
    ).toBe("unpaid");
  });

  it("lets cancelled win over everything", () => {
    expect(
      deriveStatus(
        { cancelled: true, balance: 5000, due_date: "2020-01-01" },
        TODAY,
      ),
    ).toBe("cancelled");
  });
});

describe("normalizeOrgNumber", () => {
  it("matches the same company however the number was written", () => {
    expect(normalizeOrgNumber("559900-1234")).toBe("5599001234");
    expect(normalizeOrgNumber("5599001234")).toBe("5599001234");
    expect(normalizeOrgNumber(" 559900 - 1234 ")).toBe("5599001234");
    expect(normalizeOrgNumber("165599001234")).toBe("5599001234");
  });

  it("refuses to guess at anything that is not an org number", () => {
    expect(normalizeOrgNumber("12345")).toBeNull();
    expect(normalizeOrgNumber("")).toBeNull();
    expect(normalizeOrgNumber(null)).toBeNull();
  });
});

describe("CRM references", () => {
  it("round-trips quote and deal ids through Fortnox's reference fields", () => {
    expect(parseQuoteReference(quoteReference(42))).toBe(42);
    expect(parseDealReference(dealReference(7))).toBe(7);
  });

  it("ignores references written by humans or other systems", () => {
    expect(parseQuoteReference("Vår referens: 42")).toBeNull();
    expect(parseQuoteReference("crm-quote-abc")).toBeNull();
    expect(parseQuoteReference(null)).toBeNull();
    // A deal ref must not be read as a quote ref.
    expect(parseQuoteReference(dealReference(7))).toBeNull();
  });
});

describe("formatLastModified", () => {
  it("rewinds the watermark so an invoice changed mid-minute is not lost", () => {
    // Fortnox filters on minute granularity; without the overlap an invoice
    // modified during the sync would never be picked up again.
    expect(formatLastModified("2026-07-14T10:00:00.000Z")).toBe(
      "2026-07-14 09:55",
    );
  });
});

describe("toNumber", () => {
  it("rejects junk instead of writing NaN into the mirror", () => {
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber("0")).toBe(0);
  });
});
