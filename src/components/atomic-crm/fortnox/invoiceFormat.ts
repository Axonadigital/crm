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
