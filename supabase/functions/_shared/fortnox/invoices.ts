/**
 * Mapping between Fortnox invoices and the `fortnox_invoices` mirror.
 *
 * Fortnox is loose about types: numbers come back as numbers or as strings,
 * booleans are real booleans, dates are "YYYY-MM-DD" or "" (never null). Every
 * value is normalised here so the rest of the code never has to think about it.
 */

export type FortnoxInvoiceListItem = Record<string, unknown>;
export type FortnoxInvoiceDetailItem = FortnoxInvoiceListItem & {
  InvoiceRows?: unknown;
};

export type FortnoxInvoiceRow = {
  document_number: number;
  customer_number: string | null;
  customer_name: string | null;
  organisation_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  final_pay_date: string | null;
  currency: string | null;
  total: number | null;
  total_vat: number | null;
  balance: number | null;
  booked: boolean;
  sent: boolean;
  cancelled: boolean;
  invoice_type: string | null;
  ocr: string | null;
  reminders: number | null;
  external_reference_1: string | null;
  external_reference_2: string | null;
  invoice_rows: unknown[];
  raw: FortnoxInvoiceListItem;
  detail_raw: FortnoxInvoiceDetailItem | null;
  synced_at: string;
};

/** CRM ids we stamp onto invoices we create, so the link survives both ways. */
const QUOTE_REF_PREFIX = "crm-quote-";
const DEAL_REF_PREFIX = "crm-deal-";

export function quoteReference(quoteId: number | string): string {
  return `${QUOTE_REF_PREFIX}${quoteId}`;
}

export function dealReference(dealId: number | string): string {
  return `${DEAL_REF_PREFIX}${dealId}`;
}

function parseRef(value: unknown, prefix: string): number | null {
  if (typeof value !== "string" || !value.startsWith(prefix)) return null;
  const id = Number(value.slice(prefix.length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function parseQuoteReference(value: unknown): number | null {
  return parseRef(value, QUOTE_REF_PREFIX);
}

export function parseDealReference(value: unknown): number | null {
  return parseRef(value, DEAL_REF_PREFIX);
}

/**
 * The amount for one specific installment of a deal split into equal parts.
 *
 * `index` is 1-based. Rounding each part independently can leave the sum a few
 * öre short of the deal total (10000/3 = 3333.33 × 3 = 9999.99), so the final
 * part absorbs the remainder and the parts always add up to `total` exactly.
 *
 * Mirrors installmentAmountForIndex in
 * src/components/atomic-crm/fortnox/customerBilling.ts — the frontend needs the
 * same figure to recommend what to invoice next, and the two runtimes can't
 * share a module. Keep them in step.
 */
export function installmentAmount(
  total: number,
  count: number,
  index: number,
): number {
  if (!(total > 0) || !Number.isInteger(count) || count < 1) return 0;
  if (!Number.isInteger(index) || index < 1 || index > count) return 0;

  const perPart = Math.round((total / count) * 100) / 100;
  if (index < count) return perPart;
  return Math.round((total - perPart * (count - 1)) * 100) / 100;
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number") return String(value);
  return null;
}

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  // Fortnox occasionally returns "true"/"false" as strings.
  return value === "true";
}

/**
 * Normalises a Swedish org number so 556677-8899 and 5566778899 match.
 * Both forms occur: Fortnox stores what was typed, the CRM stores what was
 * scraped.
 */
export function normalizeOrgNumber(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("16")) {
    // Some sources prefix the century.
    return digits.slice(2);
  }
  return digits.length === 10 ? digits : null;
}

export function mapInvoice(
  raw: FortnoxInvoiceListItem,
  nowIso: string,
  detailRaw: FortnoxInvoiceDetailItem | null = null,
): FortnoxInvoiceRow | null {
  const merged = { ...raw, ...(detailRaw ?? {}) };
  const documentNumber = toNumber(merged.DocumentNumber);
  if (documentNumber === null) return null;
  const invoiceRows = Array.isArray(detailRaw?.InvoiceRows)
    ? detailRaw.InvoiceRows
    : [];

  return {
    document_number: documentNumber,
    customer_number: toText(merged.CustomerNumber),
    customer_name: toText(merged.CustomerName),
    organisation_number: toText(merged.OrganisationNumber),
    invoice_date: toDate(merged.InvoiceDate),
    due_date: toDate(merged.DueDate),
    final_pay_date: toDate(merged.FinalPayDate),
    currency: toText(merged.Currency),
    total: toNumber(merged.Total),
    total_vat: toNumber(merged.TotalVAT),
    balance: toNumber(merged.Balance),
    booked: toBool(merged.Booked),
    sent: toBool(merged.Sent),
    cancelled: toBool(merged.Cancelled),
    invoice_type: toText(merged.InvoiceType),
    ocr: toText(merged.OCR),
    reminders: toNumber(merged.Reminders),
    external_reference_1: toText(merged.ExternalInvoiceReference1),
    external_reference_2: toText(merged.ExternalInvoiceReference2),
    invoice_rows: invoiceRows,
    raw,
    detail_raw: detailRaw,
    synced_at: nowIso,
  };
}

/**
 * The same rules the `status` column computes in Postgres. Kept here so tests
 * pin the behaviour, and so callers (Discord alerts, etc.) can reason about a
 * row before it is written.
 */
export type InvoiceStatus = "cancelled" | "paid" | "overdue" | "unpaid";

export function deriveStatus(
  row: Pick<FortnoxInvoiceRow, "cancelled" | "balance" | "due_date">,
  today: string,
): InvoiceStatus {
  if (row.cancelled) return "cancelled";
  if ((row.balance ?? 0) <= 0) return "paid";
  if (row.due_date !== null && row.due_date < today) return "overdue";
  return "unpaid";
}

/**
 * Fortnox wants `lastmodified` as "YYYY-MM-DD HH:MM". We rewind the watermark a
 * little on every run: the filter has minute granularity, and an invoice
 * modified in the same minute the sync started would otherwise be missed
 * forever.
 */
export const SYNC_OVERLAP_MS = 5 * 60 * 1000;

export function formatLastModified(iso: string): string {
  const date = new Date(Date.parse(iso) - SYNC_OVERLAP_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}
