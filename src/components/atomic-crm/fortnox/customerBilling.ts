import type {
  FortnoxInvoice,
  RecurringRevenueDeal,
  CustomerBillingRow,
} from "../types";
import { exVatAmount } from "./invoiceFormat";
import { monthlyAmount, type RecurringInterval } from "./liquidity";

const INTERVAL_MONTHS: Record<RecurringInterval, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const toDateOnly = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const parseDate = (value: string): Date => new Date(`${value}T00:00:00`);

const startOfYear = (year: number) => `${year}-01-01`;
const startOfNextYear = (year: number) => `${year + 1}-01-01`;

const addMonths = (date: Date, months: number): Date => {
  const next = new Date(date);
  const originalDay = next.getDate();
  next.setMonth(next.getMonth() + months);

  if (next.getDate() !== originalDay) {
    next.setDate(0);
  }

  return next;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

const daysBetween = (from: Date, to: Date): number => {
  const fromMidnight = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  );
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round(
    (toMidnight.getTime() - fromMidnight.getTime()) / (24 * 60 * 60 * 1000),
  );
};

const invoiceExVat = (invoice: FortnoxInvoice): number =>
  exVatAmount(invoice.total, invoice.total_vat);

const balanceExVat = (invoice: FortnoxInvoice): number => {
  const gross = invoice.total ?? 0;
  if (gross <= 0) return 0;
  return invoiceExVat(invoice) * ((invoice.balance ?? 0) / gross);
};

const dealInterval = (deal: RecurringRevenueDeal): RecurringInterval =>
  (deal.recurring_interval as RecurringInterval | null) ?? "monthly";

const billingCompanyId = (
  deal: RecurringRevenueDeal,
): RecurringRevenueDeal["company_id"] => {
  const id = deal.billing_company_id ?? deal.company_id;
  return id ?? null;
};

const billingCompanyName = (deal: RecurringRevenueDeal): string | null =>
  deal.billing_company_name ?? deal.company_name;

export const getCadenceLabel = (
  intervals: Array<RecurringInterval | null>,
): CustomerBillingRow["billing_cadence"] => {
  const known = [...new Set(intervals.filter(Boolean))] as RecurringInterval[];
  if (known.length === 0) return "monthly";
  if (known.length > 1) return "mixed";
  return known[0];
};

/**
 * The next invoice date for a single recurring line. Manual `invoicedThrough`
 * wins (the day after the covered period); otherwise we roll the last actual
 * invoice forward by one interval, and fall back to the billing start date when
 * there is no invoice history at all.
 */
export const getNextInvoiceDate = ({
  invoicedThrough,
  lastInvoiceDate,
  billingStartDate,
  interval,
}: {
  invoicedThrough?: string | null;
  lastInvoiceDate: string | null;
  billingStartDate?: string | null;
  interval: RecurringInterval;
}): string | null => {
  if (invoicedThrough) {
    return toDateOnly(addDays(parseDate(invoicedThrough), 1));
  }
  if (lastInvoiceDate) {
    return toDateOnly(
      addMonths(parseDate(lastInvoiceDate), INTERVAL_MONTHS[interval]),
    );
  }
  if (billingStartDate) return billingStartDate;
  return null;
};

/**
 * The date through which a recurring line is covered — the authority for how
 * much of this year is left to invoice. Manual `invoicedThrough` wins; otherwise
 * we assume the last invoice covered one interval forward (a yearly invoice in
 * January covers the whole year, which invoice dates alone can't tell you).
 */
const coveredThroughDate = ({
  invoicedThrough,
  lastInvoiceDate,
  interval,
}: {
  invoicedThrough: string | null;
  lastInvoiceDate: string | null;
  interval: RecurringInterval;
}): string | null => {
  if (invoicedThrough) return invoicedThrough;
  if (lastInvoiceDate) {
    return toDateOnly(
      addDays(
        addMonths(parseDate(lastInvoiceDate), INTERVAL_MONTHS[interval]),
        -1,
      ),
    );
  }
  return null;
};

/** How many of this calendar year's months are already covered/invoiced. */
const coveredMonthsThisYear = (
  coveredThrough: string | null,
  year: number,
): number => {
  if (!coveredThrough) return 0;
  const date = parseDate(coveredThrough);
  if (date.getFullYear() < year) return 0;
  if (date.getFullYear() > year) return 12;
  return date.getMonth() + 1;
};

export const getBillingStatus = (
  nextInvoiceDate: string | null,
  today: Date,
): CustomerBillingRow["billing_status"] => {
  if (!nextInvoiceDate) return "never_invoiced";

  const days = daysBetween(today, parseDate(nextInvoiceDate));
  if (days < 0) return "overdue";
  if (days <= 30) return "due_soon";
  return "ok";
};

const earliestDate = (dates: string[]): string | null => {
  const valid = dates.filter(Boolean);
  if (valid.length === 0) return null;
  return valid.reduce((min, current) => (current < min ? current : min));
};

const latestDate = (dates: string[]): string | null => {
  const valid = dates.filter(Boolean);
  if (valid.length === 0) return null;
  return valid.reduce((max, current) => (current > max ? current : max));
};

/**
 * When invoices are not linked to a specific recurring deal, infer coverage
 * from money: subtract one-time won value, then spread the remaining invoiced
 * amount over the customer's total monthly runrate.
 *
 * Example: 30 000 one-time + 1 000/mån, invoice paid for 35 000 ex VAT in
 * August => 5 recurring months covered (Aug-Dec), next invoice in January.
 */
const amountBasedCoveredThrough = ({
  currentYearInvoices,
  companyDeals,
  monthly,
}: {
  currentYearInvoices: FortnoxInvoice[];
  companyDeals: RecurringRevenueDeal[];
  monthly: number;
}): string | null => {
  if (monthly <= 0 || currentYearInvoices.length === 0) return null;

  const oneTimeAmount = companyDeals.reduce(
    (sum, deal) => sum + (deal.amount ?? 0),
    0,
  );
  const invoiced = currentYearInvoices.reduce(
    (sum, invoice) => sum + invoiceExVat(invoice),
    0,
  );
  const recurringInvoiced = Math.max(0, invoiced - oneTimeAmount);
  if (recurringInvoiced <= 0) return null;

  const firstInvoiceDate = earliestDate(
    currentYearInvoices
      .map((invoice) => invoice.invoice_date)
      .filter(Boolean) as string[],
  );
  if (!firstInvoiceDate) return null;

  const coveredMonths = Math.min(12, Math.ceil(recurringInvoiced / monthly));
  if (coveredMonths <= 0) return null;

  return toDateOnly(
    endOfMonth(addMonths(parseDate(firstInvoiceDate), coveredMonths - 1)),
  );
};

export const buildCustomerBillingOverview = (
  deals: RecurringRevenueDeal[],
  invoices: FortnoxInvoice[],
  today = new Date(),
): CustomerBillingRow[] => {
  const year = today.getFullYear();
  const yearStart = startOfYear(year);
  const nextYearStart = startOfNextYear(year);

  const invoicesByCompany = new Map<string, FortnoxInvoice[]>();
  for (const invoice of invoices) {
    if (!invoice.company_id || invoice.cancelled) continue;
    const key = String(invoice.company_id);
    const existing = invoicesByCompany.get(key) ?? [];
    existing.push(invoice);
    invoicesByCompany.set(key, existing);
  }

  const dealsByCompany = new Map<string, RecurringRevenueDeal[]>();
  for (const deal of deals) {
    const companyId = billingCompanyId(deal);
    if (!companyId || !deal.recurring_amount) continue;
    const key = String(companyId);
    const existing = dealsByCompany.get(key) ?? [];
    existing.push(deal);
    dealsByCompany.set(key, existing);
  }

  return [...dealsByCompany.entries()]
    .map(([companyId, companyDeals]) => {
      const billedCompanyId = billingCompanyId(companyDeals[0])!;
      const companyInvoices = invoicesByCompany.get(companyId) ?? [];
      const currentYearInvoices = companyInvoices.filter(
        (invoice) =>
          invoice.invoice_date != null &&
          invoice.invoice_date >= yearStart &&
          invoice.invoice_date < nextYearStart,
      );
      const monthly = companyDeals.reduce(
        (sum, deal) =>
          sum + monthlyAmount(deal.recurring_amount, dealInterval(deal)),
        0,
      );
      const expectedYearly = monthly * 12;
      const amountCoveredThrough = amountBasedCoveredThrough({
        currentYearInvoices,
        companyDeals,
        monthly,
      });
      const invoicedYearToDate = currentYearInvoices.reduce(
        (sum, invoice) => sum + invoiceExVat(invoice),
        0,
      );
      const paidYearToDate = currentYearInvoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoiceExVat(invoice), 0);
      const outstanding = currentYearInvoices.reduce(
        (sum, invoice) => sum + balanceExVat(invoice),
        0,
      );
      const lastInvoiceDate =
        companyInvoices
          .filter((invoice) => invoice.invoice_date)
          .map((invoice) => invoice.invoice_date as string)
          .sort((a, b) => b.localeCompare(a))[0] ?? null;

      // Schedule is computed per recurring line so a yearly and a monthly deal
      // on the same customer each get the right coverage, then aggregated.
      let remaining = 0;
      let hasManualSchedule = false;
      const nextDates: string[] = [];
      const dealRecommendations: CustomerBillingRow["next_invoice_deals"] = [];
      for (const deal of companyDeals) {
        const interval = dealInterval(deal);
        const lineMonthly = monthlyAmount(deal.recurring_amount, interval);
        if (deal.invoiced_through) hasManualSchedule = true;

        const covered = coveredMonthsThisYear(
          latestDate([
            coveredThroughDate({
              invoicedThrough: deal.invoiced_through,
              lastInvoiceDate,
              interval,
            }),
            deal.invoiced_through ? null : amountCoveredThrough,
          ]),
          year,
        );
        remaining += lineMonthly * (12 - covered);

        const nextCoveredThrough = latestDate([
          coveredThroughDate({
            invoicedThrough: deal.invoiced_through,
            lastInvoiceDate,
            interval,
          }),
          deal.invoiced_through ? null : amountCoveredThrough,
        ]);

        const next = getNextInvoiceDate({
          invoicedThrough: nextCoveredThrough,
          lastInvoiceDate,
          billingStartDate: deal.billing_start_date,
          interval,
        });
        if (next) {
          nextDates.push(next);
          dealRecommendations.push({
            deal_id: deal.id,
            deal_name: deal.name,
            company_id: deal.company_id,
            company_name: deal.company_name,
            amount: deal.recurring_amount,
            next_invoice_date: next,
          });
        }
      }

      const nextInvoiceDate = earliestDate(nextDates);
      const nextInvoiceDeals = dealRecommendations.filter(
        (deal) => deal.next_invoice_date === nextInvoiceDate,
      );
      const nextInvoiceAmount = nextInvoiceDeals.reduce(
        (sum, deal) => sum + deal.amount,
        0,
      );
      const intervals = companyDeals.map(
        (deal) => deal.recurring_interval as RecurringInterval | null,
      );

      return {
        company_id: billedCompanyId,
        company_name: billingCompanyName(companyDeals[0]),
        deal_count: companyDeals.length,
        monthly_recurring: monthly,
        expected_yearly: expectedYearly,
        billing_cadence: getCadenceLabel(intervals),
        invoiced_year_to_date: invoicedYearToDate,
        paid_year_to_date: paidYearToDate,
        remaining_to_invoice_this_year: Math.max(0, Math.round(remaining)),
        outstanding_balance: outstanding,
        last_invoice_date: lastInvoiceDate,
        next_invoice_date: nextInvoiceDate,
        next_invoice_amount: nextInvoiceAmount,
        next_invoice_deals: nextInvoiceDeals,
        billing_status: getBillingStatus(nextInvoiceDate, today),
        has_manual_schedule: hasManualSchedule,
      } satisfies CustomerBillingRow;
    })
    .sort((a, b) => {
      const statusScore: Record<CustomerBillingRow["billing_status"], number> =
        {
          overdue: 3,
          never_invoiced: 2,
          due_soon: 1,
          ok: 0,
        };
      return (
        statusScore[b.billing_status] - statusScore[a.billing_status] ||
        b.remaining_to_invoice_this_year - a.remaining_to_invoice_this_year ||
        b.monthly_recurring - a.monthly_recurring
      );
    });
};
