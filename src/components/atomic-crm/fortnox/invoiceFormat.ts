import type { FortnoxInvoice } from "../types";

export type InvoiceStatus = FortnoxInvoice["status"];

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  paid: "Betald",
  unpaid: "Obetald",
  overdue: "Förfallen",
  cancelled: "Makulerad",
};

export const formatCurrency = (
  amount: number | null | undefined,
  currency = "SEK",
) =>
  new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: currency || "SEK",
    maximumFractionDigits: 0,
  }).format(amount ?? 0);

export const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat("sv-SE").format(new Date(value)) : "—";

/**
 * Fortnox's list endpoint returns `Total` INCLUDING VAT, and the mirror's
 * `total_vat` column is not populated by the sync. Deals in the CRM are
 * ex VAT, so we derive the net amount to make the two comparable.
 * When the VAT amount is missing we assume the Swedish standard rate of
 * 25% — verified against every invoice on the live tenant (6 250 ink =
 * 5 000 ex, matching the deal amounts exactly).
 */
export const exVatAmount = (
  total: number | null | undefined,
  totalVat?: number | null,
): number => {
  const gross = total ?? 0;
  if (totalVat != null) return gross - totalVat;
  return gross / 1.25;
};

/**
 * How many days an unpaid invoice is past due. Negative means it is not due yet;
 * we only ever show this for overdue invoices.
 */
export const daysOverdue = (
  dueDate: string | null | undefined,
  today: Date = new Date(),
): number | null => {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  const midnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const diff = Math.round(
    (midnight.getTime() - due.getTime()) / (24 * 60 * 60 * 1000),
  );
  return diff > 0 ? diff : null;
};

/**
 * Whether the "not sent through Fortnox" flag is worth showing at all.
 *
 * Fortnox's `Sent` means "sent through Fortnox's own sender" — not "the customer
 * received it". Verified on the live tenant: 5 of 7 unsent invoices were fully
 * paid, because Axona had been emailing the PDF themselves. On a paid or
 * cancelled invoice the flag says nothing; on an unpaid one it is a useful hint
 * that the invoice may never have gone out.
 */
export const isUnsentAndActionable = (invoice: {
  sent: boolean;
  status: InvoiceStatus;
}): boolean =>
  !invoice.sent &&
  (invoice.status === "unpaid" || invoice.status === "overdue");

export const formatSyncedAt = (value: string | null | undefined) => {
  if (!value) return "aldrig";
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60000);
  if (minutes < 1) return "nyss";
  if (minutes < 60) return `för ${minutes} min sedan`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `för ${hours} h sedan`;
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
};
