import type { Deal, CustomerBillingRow } from "../types";
import { getBillingStatus, getNextInvoiceDate } from "./customerBilling";
import type { RecurringInterval } from "./liquidity";

export type DealBillingSchedule = {
  date: string;
  status: CustomerBillingRow["billing_status"];
};

/**
 * The next invoice date for a single deal, from the deal's own fields alone —
 * used for the small badge on deal cards and the deal page, where we don't have
 * the company's invoice history loaded. Manual `invoiced_through` drives it,
 * else `billing_start_date`; without either there is nothing reliable to show.
 */
export const dealNextInvoice = (
  deal: Pick<
    Deal,
    | "recurring_amount"
    | "recurring_interval"
    | "invoiced_through"
    | "billing_start_date"
  >,
  today = new Date(),
): DealBillingSchedule | null => {
  if (!deal.recurring_amount) return null;
  const interval = (deal.recurring_interval ?? "monthly") as RecurringInterval;
  const date = getNextInvoiceDate({
    invoicedThrough: deal.invoiced_through,
    lastInvoiceDate: null,
    billingStartDate: deal.billing_start_date,
    interval,
  });
  if (!date) return null;
  return { date, status: getBillingStatus(date, today) };
};
