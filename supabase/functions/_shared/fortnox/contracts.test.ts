import { describe, expect, it } from "vitest";

import {
  buildContractPayload,
  buildContractRows,
  invoiceIntervalFor,
  mapContract,
} from "./contracts.ts";

const NOW = "2026-07-17T12:00:00.000Z";

describe("invoiceIntervalFor", () => {
  it("maps each cadence to months", () => {
    expect(invoiceIntervalFor("monthly")).toBe(1);
    expect(invoiceIntervalFor("quarterly")).toBe(3);
    expect(invoiceIntervalFor("yearly")).toBe(12);
  });

  it("defaults a missing interval to monthly", () => {
    expect(invoiceIntervalFor(null)).toBe(1);
    expect(invoiceIntervalFor(undefined)).toBe(1);
  });
});

describe("buildContractRows", () => {
  it("builds one row from the recurring amount, carrying the contract article", () => {
    const rows = buildContractRows(
      {
        id: 5,
        name: "Månadsavtal hemsida",
        recurring_amount: 1000,
        recurring_interval: "monthly",
      },
      "AVTAL",
    );
    expect(rows).toEqual([
      {
        Description: "Månadsavtal hemsida",
        DeliveredQuantity: "1",
        Price: 1000,
        VAT: 25,
        AccountNumber: 3001,
        ArticleNumber: "AVTAL",
      },
    ]);
  });

  it("falls back to a generic description when the deal has no name", () => {
    const rows = buildContractRows(
      {
        id: 5,
        name: null,
        recurring_amount: 199,
        recurring_interval: "monthly",
      },
      "AVTAL",
    );
    expect(rows[0].Description).toBe("Löpande avtal");
  });
});

describe("buildContractPayload", () => {
  it("builds a continuous monthly contract linked to the deal", () => {
    const payload = buildContractPayload(
      {
        id: 42,
        name: "Retainer",
        recurring_amount: 500,
        recurring_interval: "monthly",
      },
      "12",
      "2026-07-17",
      "AVTAL",
    );

    expect(payload).toMatchObject({
      CustomerNumber: "12",
      ContractDate: "2026-07-17",
      PeriodStart: "2026-07-17",
      InvoiceInterval: 1,
      Continuous: true,
      Currency: "SEK",
      Language: "SV",
      ExternalInvoiceReference2: "crm-deal-42",
    });
    expect(payload.InvoiceRows).toHaveLength(1);
    expect(payload.InvoiceRows[0].Price).toBe(500);
    expect(payload.InvoiceRows[0].ArticleNumber).toBe("AVTAL");
  });

  it("uses a 12-month interval for a yearly deal", () => {
    const payload = buildContractPayload(
      {
        id: 1,
        name: "Årsavtal",
        recurring_amount: 5988,
        recurring_interval: "yearly",
      },
      "12",
      "2026-01-01",
      "AVTAL",
    );
    expect(payload.InvoiceInterval).toBe(12);
  });
});

describe("mapContract", () => {
  it("maps a Fortnox contract into the mirror shape", () => {
    const row = mapContract(
      {
        DocumentNumber: 7,
        CustomerNumber: "12",
        ContractDate: "2026-07-17",
        PeriodStart: "2026-07-17",
        InvoiceInterval: 1,
        Total: 500,
        Active: "ACTIVE",
      },
      NOW,
    );
    expect(row).toMatchObject({
      document_number: 7,
      customer_number: "12",
      invoice_interval: 1,
      total: 500,
      active: true,
      synced_at: NOW,
    });
  });

  it("returns null without a document number", () => {
    expect(mapContract({ CustomerNumber: "12" }, NOW)).toBeNull();
  });
});
