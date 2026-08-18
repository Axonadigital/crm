/**
 * Fortnox Recurring Billing — "Återkommande fakturering".
 *
 * This is the API behind what Fortnox shows under Fakturering → Återkommande,
 * released 2026-08. It is NOT the older `/3/contracts` resource, which is a
 * separate legacy agreement system that Fortnox support confirmed is not the
 * same feature: different base path, UUID ids instead of numeric document
 * numbers, and ETag-based optimistic concurrency.
 *
 * Two facts from the spec shape how this module is used:
 *
 * 1. POST always persists with status ACTIVE — there is no "create a draft"
 *    input, and ACTIVE cannot be moved back to DRAFT (verified against a
 *    sandbox: "Recurring in state ACTIVE cannot transition to DRAFT"). The
 *    reachable review state is INACTIVE, which the spec defines as "retained
 *    but not generating invoices". So creation posts with MANUAL handling and
 *    immediately pauses to INACTIVE — two independent reasons nothing can go
 *    out — and activation flips it to ACTIVE + AUTOMATIC.
 * 2. `frequency` only accepts MONTH or WEEK, so a quarterly or yearly cadence is
 *    expressed as a month interval (3 and 12), not its own frequency.
 */

/** Collection path. A single recurring is `${RECURRINGS_PATH}/${uuid}`. */
export const RECURRINGS_PATH = "/api/recurring-billing/recurrings-v1";

/** Sales account for recurring rows — same 3001 every mirrored invoice row uses. */
export const RECURRING_SALES_ACCOUNT = 3001;
export const RECURRING_VAT_PERCENTAGE = 25;

export type RecurringInterval = "monthly" | "quarterly" | "yearly";

export type RecurringStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "FINISHED";

/**
 * The state a newly created recurring is parked in for review. Not DRAFT:
 * Fortnox only allows DRAFT before a recurring has ever been activated, and
 * POST always activates.
 */
export const REVIEW_STATUS: RecurringStatus = "INACTIVE";

export type InvoiceHandling =
  | "MANUAL"
  | "AUTOMATIC"
  | "INVOICE_SERVICE_WITH_REMINDERS"
  | "INVOICE_SERVICE_WITHOUT_REMINDERS";

export type RecurringRule = {
  interval: number;
  frequency: "MONTH";
};

/** How many months between invoices for each cadence we sell. */
const MONTHS_PER_INTERVAL: Record<RecurringInterval, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/**
 * The cadence rule for one of our billing intervals. Fortnox has no QUARTER or
 * YEAR frequency — those are month intervals of 3 and 12.
 */
export function recurringRuleFor(
  interval: RecurringInterval | null | undefined,
): RecurringRule {
  return {
    interval: MONTHS_PER_INTERVAL[interval ?? "monthly"] ?? 1,
    frequency: "MONTH",
  };
}

export type BuildRecurringInput = {
  customerNumber: string;
  description: string;
  price: number;
  interval: RecurringInterval | null | undefined;
  /** First invoice/period date, `YYYY-MM-DD`. */
  startDate: string;
  currency?: string;
  /** Defaults to MANUAL so creating one can never bill anybody by itself. */
  invoiceHandling?: InvoiceHandling;
  ourReference?: string | null;
};

export type CreateRecurringPayload = {
  customer: { number: string };
  dates: {
    dates: { invoice_processing_date: string; period_start_date: string };
    rules: RecurringRule;
  };
  rows: Array<{
    type: "SERVICE";
    description: string;
    quantity: number;
    price: number;
    account_number: number;
    vat_percentage: number;
  }>;
  invoice_handling: InvoiceHandling;
  currency: string;
  our_reference?: string;
};

/**
 * The create body. `invoice_processing_date` and `period_start_date` are the
 * only required dates; anchors (which day of the month) are derived by Fortnox
 * from them, so a deal starting the 1st stays on the 1st without us saying so.
 */
export function buildCreateRecurringPayload(
  input: BuildRecurringInput,
): CreateRecurringPayload {
  if (!input.customerNumber) {
    throw new Error("Cannot create a recurring without a Fortnox customer");
  }
  if (!(input.price > 0)) {
    throw new Error("Cannot create a recurring without a positive amount");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error(`Invalid recurring start date: ${input.startDate}`);
  }

  return {
    customer: { number: String(input.customerNumber) },
    dates: {
      dates: {
        invoice_processing_date: input.startDate,
        period_start_date: input.startDate,
      },
      rules: recurringRuleFor(input.interval),
    },
    rows: [
      {
        type: "SERVICE",
        description: input.description?.trim() || "Tjänst",
        quantity: 1,
        price: input.price,
        account_number: RECURRING_SALES_ACCOUNT,
        vat_percentage: RECURRING_VAT_PERCENTAGE,
      },
    ],
    invoice_handling: input.invoiceHandling ?? "MANUAL",
    currency: input.currency ?? "SEK",
    ...(input.ourReference ? { our_reference: input.ourReference } : {}),
  };
}

/** JSON Patch operations, the only write shape PATCH accepts. */
export function replaceOps(
  values: Record<string, string | number>,
): Array<{ op: "replace"; path: string; value: string | number }> {
  return Object.entries(values).map(([path, value]) => ({
    op: "replace",
    path: path.startsWith("/") ? path : `/${path}`,
    value,
  }));
}
