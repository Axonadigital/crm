import type { FortnoxRecurringSupplier } from "../types";

/**
 * Splits recurring suppliers into fixed subscriptions and recurring-but-
 * variable purchases.
 *
 * A subscription is "same-ish amount every time": the spread between the
 * cheapest and the most expensive invoice stays within 20% of the average.
 * That tolerance absorbs öres-rounding and small plan adjustments without
 * letting genuinely variable suppliers (usage-based billing, ad spend)
 * masquerade as fixed costs.
 */
export const SUBSCRIPTION_SPREAD_TOLERANCE = 0.2;

export type RecurringKind = "subscription" | "variable";

export const classifyRecurring = (
  supplier: Pick<
    FortnoxRecurringSupplier,
    "avg_total" | "min_total" | "max_total"
  >,
): RecurringKind => {
  const avg = Math.abs(supplier.avg_total);
  if (avg === 0) return "variable";
  const spread = (supplier.max_total - supplier.min_total) / avg;
  return spread <= SUBSCRIPTION_SPREAD_TOLERANCE ? "subscription" : "variable";
};

/** Whole calendar months between two ISO dates (day-of-month ignored). */
const monthsBetween = (firstIso: string, lastIso: string): number => {
  const first = new Date(firstIso);
  const last = new Date(lastIso);
  return (
    (last.getFullYear() - first.getFullYear()) * 12 +
    (last.getMonth() - first.getMonth())
  );
};

/**
 * The subscription's cost per month. Invoices may be quarterly or yearly, so
 * "average invoice" is not "monthly cost" — instead the average invoice is
 * spread over the average gap between invoices. A monthly subscription
 * (gap 1) costs avg_total per month; a quarterly one (gap 3) a third of the
 * invoice per month.
 *
 * With only 2-3 data points the gap estimate is rough — it stabilises as
 * invoice history accumulates.
 */
export const estimatedMonthlyCost = (
  supplier: Pick<
    FortnoxRecurringSupplier,
    "avg_total" | "invoice_count" | "first_invoice_date" | "last_invoice_date"
  >,
): number => {
  if (supplier.invoice_count <= 1) return supplier.avg_total;
  if (!supplier.first_invoice_date || !supplier.last_invoice_date) {
    return supplier.avg_total;
  }
  const span = monthsBetween(
    supplier.first_invoice_date,
    supplier.last_invoice_date,
  );
  const gapMonths = Math.max(1, span / (supplier.invoice_count - 1));
  return supplier.avg_total / gapMonths;
};
