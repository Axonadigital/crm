/**
 * Mapping between Fortnox supplier invoices (leverantörsfakturor) and the
 * `fortnox_supplier_invoices` mirror.
 *
 * Same normalisation rules as invoices.ts. One extra quirk: the supplier
 * invoice list has used both `Cancelled` and `Cancel` as the flag name across
 * Fortnox API versions, so the mapper accepts either rather than betting on
 * one.
 */

import { toDate, toNumber } from "./invoices.ts";

export type FortnoxSupplierInvoiceListItem = Record<string, unknown>;

export type FortnoxSupplierInvoiceRow = {
  given_number: number;
  supplier_number: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  final_pay_date: string | null;
  currency: string | null;
  total: number | null;
  vat: number | null;
  balance: number | null;
  booked: boolean;
  cancelled: boolean;
  credit: boolean;
  raw: FortnoxSupplierInvoiceListItem;
  synced_at: string;
};

function toText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return String(value);
  return null;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return value === "true";
}

export function mapSupplierInvoice(
  raw: FortnoxSupplierInvoiceListItem,
  nowIso: string,
): FortnoxSupplierInvoiceRow | null {
  const givenNumber = toNumber(raw.GivenNumber);
  if (givenNumber === null) return null;

  return {
    given_number: givenNumber,
    supplier_number: toText(raw.SupplierNumber),
    supplier_name: toText(raw.SupplierName),
    invoice_number: toText(raw.InvoiceNumber),
    invoice_date: toDate(raw.InvoiceDate),
    due_date: toDate(raw.DueDate),
    final_pay_date: toDate(raw.FinalPayDate),
    currency: toText(raw.Currency),
    total: toNumber(raw.Total),
    vat: toNumber(raw.VAT),
    balance: toNumber(raw.Balance),
    booked: toBool(raw.Booked),
    cancelled: toBool(raw.Cancelled ?? raw.Cancel),
    credit: toBool(raw.Credit),
    raw,
    synced_at: nowIso,
  };
}
