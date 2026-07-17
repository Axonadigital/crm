/**
 * Fortnox contracts (avtal) — the recurring-billing side of a won deal.
 *
 * A Fortnox contract holds the recurring amount and cadence; Fortnox then
 * generates an invoice each period. Creating a contract does NOT create or book
 * any invoice, so this stays on the right side of the project rule "never book
 * automatically": the contract is a template, a human still creates and sends
 * each invoice (or a later cron creates unbooked drafts for review).
 *
 * The payload builder is pure so it can be unit tested without a Fortnox
 * tenant. Contract rows reuse the same free-text row shape as invoices
 * (Description + Price + AccountNumber, no article) — see the note on
 * `buildContractRows`.
 */

import {
  DEFAULT_SALES_ACCOUNT,
  DEFAULT_VAT_RATE,
  type FortnoxInvoiceRowPayload,
} from "./customers.ts";
import { dealReference, toDate, toNumber } from "./invoices.ts";

export type RecurringInterval = "monthly" | "quarterly" | "yearly";

/** Months between invoices for each cadence. A null interval bills monthly. */
export const INVOICE_INTERVAL_MONTHS: Record<RecurringInterval, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

export type RecurringDeal = {
  id: number;
  name: string | null;
  recurring_amount: number;
  recurring_interval: RecurringInterval | null;
};

export type FortnoxContractPayload = {
  CustomerNumber: string;
  ContractDate: string;
  PeriodStart: string;
  InvoiceInterval: number;
  Continuous: boolean;
  Currency: string;
  Language: string;
  InvoiceRows: FortnoxInvoiceRowPayload[];
  ExternalInvoiceReference2: string;
};

export function invoiceIntervalFor(
  interval: RecurringInterval | null | undefined,
): number {
  return interval ? INVOICE_INTERVAL_MONTHS[interval] : 1;
}

/**
 * The single recurring row. Free-text (no ArticleNumber) with an explicit sales
 * account, exactly like invoice rows. If a tenant's contract endpoint turns out
 * to require an article, this is the one place to add it.
 */
export function buildContractRows(
  deal: RecurringDeal,
): FortnoxInvoiceRowPayload[] {
  return [
    {
      Description: deal.name?.trim() || "Löpande avtal",
      DeliveredQuantity: "1",
      Price: deal.recurring_amount,
      VAT: DEFAULT_VAT_RATE,
      AccountNumber: DEFAULT_SALES_ACCOUNT,
    },
  ];
}

/**
 * Builds the `POST /3/contracts` body for a recurring deal.
 * `startDate` is an ISO date (YYYY-MM-DD) — passed in rather than read from the
 * clock so the builder stays pure and testable.
 */
export function buildContractPayload(
  deal: RecurringDeal,
  customerNumber: string,
  startDate: string,
  options: { currency?: string } = {},
): FortnoxContractPayload {
  return {
    CustomerNumber: customerNumber,
    ContractDate: startDate,
    PeriodStart: startDate,
    InvoiceInterval: invoiceIntervalFor(deal.recurring_interval),
    // Runs until someone cancels it — a retainer has no fixed end.
    Continuous: true,
    Currency: options.currency ?? "SEK",
    Language: "SV",
    InvoiceRows: buildContractRows(deal),
    // Link back to the CRM deal, matching how invoices reference their deal.
    ExternalInvoiceReference2: dealReference(deal.id),
  };
}

export type FortnoxContractRow = {
  document_number: number;
  customer_number: string | null;
  contract_date: string | null;
  period_start: string | null;
  invoice_interval: number | null;
  total: number | null;
  active: boolean;
  raw: Record<string, unknown>;
  synced_at: string;
};

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return value === "true";
}

function toText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return String(value);
  return null;
}

/** Normalises a Fortnox contract into the mirror shape. */
export function mapContract(
  raw: Record<string, unknown>,
  nowIso: string,
): FortnoxContractRow | null {
  const documentNumber = toNumber(raw.DocumentNumber);
  if (documentNumber === null) return null;

  return {
    document_number: documentNumber,
    customer_number: toText(raw.CustomerNumber),
    contract_date: toDate(raw.ContractDate),
    period_start: toDate(raw.PeriodStart),
    invoice_interval: toNumber(raw.InvoiceInterval),
    total: toNumber(raw.Total),
    // Fortnox uses "ACTIVE" / "FINISHED" for the contract state.
    active: toText(raw.Active) === "ACTIVE" || toBool(raw.Active),
    raw,
    synced_at: nowIso,
  };
}
