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

const INTERVAL_PRIORITY: RecurringInterval[] = [
  "monthly",
  "quarterly",
  "yearly",
];

const toDateOnly = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

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

export const getCadenceLabel = (
  intervals: Array<RecurringInterval | null>,
): CustomerBillingRow["billing_cadence"] => {
  const known = [...new Set(intervals.filter(Boolean))] as RecurringInterval[];
  if (known.length === 0) return "monthly";
  if (known.length > 1) return "mixed";
  return known[0];
};

export const getPrimaryInterval = (
  intervals: Array<RecurringInterval | null>,
): RecurringInterval => {
  const known = intervals.filter(Boolean) as RecurringInterval[];
  return (
    INTERVAL_PRIORITY.find((interval) => known.includes(interval)) ?? "monthly"
  );
};

export const getNextInvoiceDate = ({
  lastInvoiceDate,
  interval,
}: {
  lastInvoiceDate: string | null;
  interval: RecurringInterval;
}): string | null => {
  if (!lastInvoiceDate) return null;
  return toDateOnly(
    addMonths(
      new Date(`${lastInvoiceDate}T00:00:00`),
      INTERVAL_MONTHS[interval],
    ),
  );
};

export const getBillingStatus = (
  nextInvoiceDate: string | null,
  today: Date,
): CustomerBillingRow["billing_status"] => {
  if (!nextInvoiceDate) return "never_invoiced";

  const days = daysBetween(today, new Date(`${nextInvoiceDate}T00:00:00`));
  if (days < 0) return "overdue";
  if (days <= 30) return "due_soon";
  return "ok";
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
    if (!deal.company_id || !deal.recurring_amount) continue;
    const key = String(deal.company_id);
    const existing = dealsByCompany.get(key) ?? [];
    existing.push(deal);
    dealsByCompany.set(key, existing);
  }

  return [...dealsByCompany.entries()]
    .map(([companyId, companyDeals]) => {
      const companyInvoices = invoicesByCompany.get(companyId) ?? [];
      const currentYearInvoices = companyInvoices.filter(
        (invoice) =>
          invoice.invoice_date != null &&
          invoice.invoice_date >= yearStart &&
          invoice.invoice_date < nextYearStart,
      );
      const monthly = companyDeals.reduce(
        (sum, deal) =>
          sum +
          monthlyAmount(
            deal.recurring_amount,
            deal.recurring_interval as RecurringInterval | null,
          ),
        0,
      );
      const expectedYearly = monthly * 12;
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
      const lastInvoice =
        companyInvoices
          .filter((invoice) => invoice.invoice_date)
          .sort((a, b) =>
            String(b.invoice_date).localeCompare(String(a.invoice_date)),
          )[0] ?? null;
      const intervals = companyDeals.map(
        (deal) => deal.recurring_interval as RecurringInterval | null,
      );
      const nextInvoiceDate = getNextInvoiceDate({
        lastInvoiceDate: lastInvoice?.invoice_date ?? null,
        interval: getPrimaryInterval(intervals),
      });

      return {
        company_id: companyDeals[0].company_id!,
        company_name: companyDeals[0].company_name,
        deal_count: companyDeals.length,
        monthly_recurring: monthly,
        expected_yearly: expectedYearly,
        billing_cadence: getCadenceLabel(intervals),
        invoiced_year_to_date: invoicedYearToDate,
        paid_year_to_date: paidYearToDate,
        remaining_to_invoice_this_year: Math.max(
          0,
          expectedYearly - invoicedYearToDate,
        ),
        outstanding_balance: outstanding,
        last_invoice_date: lastInvoice?.invoice_date ?? null,
        next_invoice_date: nextInvoiceDate,
        billing_status: getBillingStatus(nextInvoiceDate, today),
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
