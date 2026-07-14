/**
 * Mapping between Fortnox offers and the `fortnox_offers` mirror.
 *
 * Same normalisation rules as invoices: Fortnox is loose about types, and empty
 * strings must become nulls.
 */

import { toDate, toNumber } from "./invoices.ts";

export type FortnoxOfferListItem = Record<string, unknown>;

export type FortnoxOfferRow = {
  document_number: number;
  customer_number: string | null;
  customer_name: string | null;
  offer_date: string | null;
  expire_date: string | null;
  currency: string | null;
  total: number | null;
  total_vat: number | null;
  cancelled: boolean;
  sent: boolean;
  order_reference: string | null;
  invoice_reference: string | null;
  external_reference_1: string | null;
  external_reference_2: string | null;
  raw: FortnoxOfferListItem;
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

/**
 * Fortnox uses "0" — not null, not empty — to mean "this offer has not become
 * an order or an invoice". Treating "0" as a real reference would make every
 * unconverted offer look converted.
 */
function toReference(value: unknown): string | null {
  const text = toText(value);
  return text === null || text === "0" ? null : text;
}

export function mapOffer(
  raw: FortnoxOfferListItem,
  nowIso: string,
): FortnoxOfferRow | null {
  const documentNumber = toNumber(raw.DocumentNumber);
  if (documentNumber === null) return null;

  return {
    document_number: documentNumber,
    customer_number: toText(raw.CustomerNumber),
    customer_name: toText(raw.CustomerName),
    offer_date: toDate(raw.OfferDate),
    expire_date: toDate(raw.ExpireDate),
    currency: toText(raw.Currency),
    total: toNumber(raw.Total),
    total_vat: toNumber(raw.TotalVAT),
    cancelled: toBool(raw.Cancelled),
    sent: toBool(raw.Sent),
    order_reference: toReference(raw.OrderReference),
    invoice_reference: toReference(raw.InvoiceReference),
    external_reference_1: toText(raw.ExternalInvoiceReference1),
    external_reference_2: toText(raw.ExternalInvoiceReference2),
    raw,
    synced_at: nowIso,
  };
}
