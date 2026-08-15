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

const isInstallmentDeal = (deal: RecurringRevenueDeal): boolean =>
  deal.billing_schedule_type === "installment" &&
  (deal.amount ?? 0) > 0 &&
  (deal.installment_count ?? 0) > 0;

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
  fallback: CustomerBillingRow["billing_cadence"] = "one_time",
): CustomerBillingRow["billing_cadence"] => {
  const known = [...new Set(intervals.filter(Boolean))] as RecurringInterval[];
  if (known.length === 0) return fallback;
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
  hasInvoiceHistory: boolean = false,
): CustomerBillingRow["billing_status"] => {
  if (!nextInvoiceDate) {
    return hasInvoiceHistory ? "fully_invoiced" : "never_invoiced";
  }

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

const hasInvoiceRows = (invoice: FortnoxInvoice): boolean =>
  Array.isArray(invoice.invoice_rows) && invoice.invoice_rows.length > 0;

const rowNumber = (
  row: Record<string, unknown>,
  ...keys: string[]
): number | null => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
};

const sameMoney = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && Math.abs(a - b) < 0.5;

const rowTotalExVat = (row: Record<string, unknown>): number | null =>
  rowNumber(row, "TotalExcludingVAT", "Total", "PriceExcludingVAT", "Price");

const invoiceMatchesDealAmount = (
  deal: RecurringRevenueDeal,
  invoice: FortnoxInvoice,
): boolean => {
  if (!deal.amount || invoice.status === "cancelled") return false;
  if (invoice.deal_id != null && String(invoice.deal_id) === String(deal.id)) {
    return true;
  }
  if (sameMoney(invoiceExVat(invoice), deal.amount)) return true;
  if (!hasInvoiceRows(invoice) && invoiceExVat(invoice) >= deal.amount) {
    return true;
  }
  return (invoice.invoice_rows ?? []).some((row) =>
    sameMoney(rowTotalExVat(row), deal.amount),
  );
};

const installmentAmount = (deal: RecurringRevenueDeal): number =>
  isInstallmentDeal(deal)
    ? Math.round((deal.amount / deal.installment_count!) * 100) / 100
    : 0;

/**
 * The recommended amount for one specific installment. Rounding each
 * installment independently can leave the sum a few öre short of the deal's
 * total (e.g. 10000/3 = 3333.33 × 3 = 9999.99), so the final installment
 * absorbs the remainder instead. Only used for the displayed/recommended
 * amount — matching (`invoiceMatchesInstallment`) stays on the flat value
 * since its tolerance already swallows a few öre either way.
 */
const installmentAmountForIndex = (
  deal: RecurringRevenueDeal,
  index: number,
): number => {
  if (!isInstallmentDeal(deal)) return 0;
  const count = deal.installment_count!;
  const perInstallment = installmentAmount(deal);
  if (index < count) return perInstallment;
  return Math.round((deal.amount - perInstallment * (count - 1)) * 100) / 100;
};

const invoiceMatchesInstallment = (
  deal: RecurringRevenueDeal,
  invoice: FortnoxInvoice,
): boolean => {
  if (!isInstallmentDeal(deal) || invoice.status === "cancelled") return false;

  // An invoice explicitly linked to a different deal can never be this
  // deal's installment, no matter what it costs — unlike the fallback below,
  // a real link is authoritative and must not be overridden by a coincidental
  // amount match.
  if (invoice.deal_id != null) {
    return (
      String(invoice.deal_id) === String(deal.id) &&
      sameMoney(invoiceExVat(invoice), installmentAmount(deal))
    );
  }

  // Unlinked invoice: fall back to amount matching, but only among invoices
  // dated on/after this deal's billing start — an invoice from before the
  // deal existed can't be one of its installments, no matter the amount.
  if (
    deal.billing_start_date &&
    invoice.invoice_date &&
    invoice.invoice_date < deal.billing_start_date
  ) {
    return false;
  }

  const amount = installmentAmount(deal);
  if (sameMoney(invoiceExVat(invoice), amount)) return true;
  return (invoice.invoice_rows ?? []).some((row) =>
    sameMoney(rowTotalExVat(row), amount),
  );
};

const invoicedInstallmentCount = (
  deal: RecurringRevenueDeal,
  companyInvoices: FortnoxInvoice[],
): number =>
  Math.min(
    deal.installment_count ?? 0,
    companyInvoices.filter((invoice) =>
      invoiceMatchesInstallment(deal, invoice),
    ).length,
  );

/**
 * Deals with an un-invoiced one-time component: pure one-time deals, and the
 * one-time portion of a combo deal (a setup fee alongside a recurring line).
 * Pure recurring deals never reach here (amount defaults to 0), and combo
 * deals with `amount` and `recurring_amount` both set still need their
 * one-time part checked — `amountBasedCoveredThrough` already treats a combo
 * deal's `amount` as real one-time value elsewhere in this file, so skipping
 * the check here would leave that value permanently unverified.
 */
const uninvoicedOneTimeDeals = (
  companyDeals: RecurringRevenueDeal[],
  companyInvoices: FortnoxInvoice[],
): RecurringRevenueDeal[] => {
  const oneTimeCandidates = companyDeals.filter(
    (deal) => (deal.amount ?? 0) > 0 && !isInstallmentDeal(deal),
  );
  const unmatched = oneTimeCandidates.filter(
    (deal) =>
      !companyInvoices.some((invoice) =>
        invoiceMatchesDealAmount(deal, invoice),
      ),
  );

  // Ambiguity-free fallback: a negotiated discount or rounding can leave a
  // genuinely paid deal's amount not exactly matching its invoice. When
  // there's exactly one still-unmatched one-time deal and exactly one
  // invoice nothing else on the company claims by amount, there's no real
  // ambiguity about which invoice it is — don't flag it as missing.
  // Skipped whenever the company also has a recurring deal, since those
  // infer coverage from the same invoices via separate, amount-agnostic
  // logic this fallback could otherwise conflict with.
  const hasRecurringDeal = companyDeals.some(
    (deal) => (deal.recurring_amount ?? 0) > 0,
  );
  if (unmatched.length !== 1 || hasRecurringDeal) return unmatched;

  const otherMatchedCandidates = oneTimeCandidates.filter(
    (deal) => deal !== unmatched[0],
  );
  const claimedDocNumbers = new Set(
    companyInvoices
      .filter((invoice) =>
        otherMatchedCandidates.some((deal) =>
          invoiceMatchesDealAmount(deal, invoice),
        ),
      )
      .map((invoice) => invoice.document_number),
  );
  const unclaimedInvoices = companyInvoices.filter(
    (invoice) => !claimedDocNumbers.has(invoice.document_number),
  );

  return unclaimedInvoices.length === 1 ? [] : unmatched;
};

/**
 * Prefer Fortnox invoice rows over customer-level totals. A row with quantity
 * 5 and price 1000 on a monthly deal means five monthly periods are covered;
 * using the total invoice would wrongly let unrelated one-time rows move the
 * recurring schedule.
 */
const rowBasedCoveredThrough = (
  deal: RecurringRevenueDeal,
  currentYearInvoices: FortnoxInvoice[],
): string | null => {
  if (dealInterval(deal) !== "monthly" || !deal.recurring_amount) return null;

  const covered: string[] = [];
  for (const invoice of currentYearInvoices) {
    if (invoice.status !== "paid" || !invoice.invoice_date) continue;
    for (const row of invoice.invoice_rows ?? []) {
      const price = rowNumber(row, "PriceExcludingVAT", "Price");
      const quantity = rowNumber(row, "DeliveredQuantity", "Quantity");
      if (!sameMoney(price, deal.recurring_amount) || !quantity) continue;
      covered.push(
        toDateOnly(
          endOfMonth(addMonths(parseDate(invoice.invoice_date), quantity)),
        ),
      );
    }
  }

  return latestDate(covered);
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
    if (!companyId || (!deal.amount && !deal.recurring_amount)) continue;
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
      // Money owed doesn't stop being owed when the calendar year turns, so
      // this spans every mirrored invoice rather than the current year only.
      const outstanding = companyInvoices.reduce(
        (sum, invoice) => sum + balanceExVat(invoice),
        0,
      );
      const lastInvoiceDate =
        companyInvoices
          .filter((invoice) => invoice.invoice_date)
          .map((invoice) => invoice.invoice_date as string)
          .sort((a, b) => b.localeCompare(a))[0] ?? null;

      // A deal being fully invoiced only means nothing new needs sending —
      // it says nothing about whether what was already sent got paid. Track
      // that separately so an overdue balance can never hide behind "Klar".
      const overdueInvoices = companyInvoices.filter(
        (invoice) => invoice.status === "overdue",
      );
      const overdueInvoiceAmount = overdueInvoices.reduce(
        (sum, invoice) => sum + balanceExVat(invoice),
        0,
      );

      // No invoice in the mirror carries a deal_id, so "the company's latest
      // invoice" is only a safe anchor for a recurring line when nothing else
      // could have produced it. On a customer who also bought a one-time job,
      // that invoice is most likely the one-time one — anchoring to it invents
      // a schedule out of an unrelated payment (a 499/mån line inheriting a
      // website invoice's date, then reporting months it never billed).
      const hasOneTimeValue = companyDeals.some(
        (deal) => (deal.amount ?? 0) > 0,
      );
      const recurringAnchorDate = hasOneTimeValue ? null : lastInvoiceDate;

      // Schedule is computed per recurring line so a yearly and a monthly deal
      // on the same customer each get the right coverage, then aggregated.
      let remaining = 0;
      let hasManualSchedule = false;
      let hasRowBasedCoverage = false;
      const nextDates: string[] = [];
      const unanchoredRecurringDeals: RecurringRevenueDeal[] = [];
      const dealRecommendations: CustomerBillingRow["next_invoice_deals"] = [];
      for (const deal of companyDeals) {
        if (!deal.recurring_amount || deal.recurring_amount <= 0) continue;
        const interval = dealInterval(deal);
        const lineMonthly = monthlyAmount(deal.recurring_amount, interval);
        if (deal.invoiced_through) hasManualSchedule = true;
        const rowCoveredThrough = rowBasedCoveredThrough(
          deal,
          currentYearInvoices,
        );
        if (rowCoveredThrough) hasRowBasedCoverage = true;
        const inferredCoveredThrough =
          rowCoveredThrough ??
          (deal.invoiced_through ? null : amountCoveredThrough);

        // Nothing trustworthy to date the schedule from: no hand-set "invoiced
        // through", no billing start date, and no invoice this line can claim.
        // Emit no next-invoice date rather than a fabricated one — but still
        // count a full year as unbilled, because as far as the data shows this
        // line has never been invoiced, and hiding the money would be a worse
        // error than overstating it next to a warning that says why.
        if (
          !deal.invoiced_through &&
          !deal.billing_start_date &&
          !recurringAnchorDate &&
          !inferredCoveredThrough
        ) {
          unanchoredRecurringDeals.push(deal);
          remaining += lineMonthly * 12;
          continue;
        }

        const covered = coveredMonthsThisYear(
          latestDate([
            coveredThroughDate({
              invoicedThrough: deal.invoiced_through,
              lastInvoiceDate: recurringAnchorDate,
              interval,
            }),
            inferredCoveredThrough,
          ]),
          year,
        );
        remaining += lineMonthly * (12 - covered);

        const nextCoveredThrough = latestDate([
          coveredThroughDate({
            invoicedThrough: deal.invoiced_through,
            lastInvoiceDate: recurringAnchorDate,
            interval,
          }),
          inferredCoveredThrough,
        ]);

        const next = getNextInvoiceDate({
          invoicedThrough: nextCoveredThrough,
          lastInvoiceDate: recurringAnchorDate,
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
      const missingOneTimeDeals = uninvoicedOneTimeDeals(
        companyDeals,
        companyInvoices,
      );
      const dueInstallments = companyDeals
        .filter(isInstallmentDeal)
        .map((deal) => {
          const invoicedCount = invoicedInstallmentCount(deal, companyInvoices);
          if (invoicedCount >= (deal.installment_count ?? 0)) return null;
          const startDate = deal.billing_start_date ?? toDateOnly(today);
          const intervalMonths = deal.installment_interval_months ?? 1;
          const nextDate = toDateOnly(
            addMonths(parseDate(startDate), invoicedCount * intervalMonths),
          );
          return {
            deal,
            installmentIndex: invoicedCount + 1,
            nextDate,
            amount: installmentAmountForIndex(deal, invoicedCount + 1),
          };
        })
        .filter(Boolean) as Array<{
        deal: RecurringRevenueDeal;
        installmentIndex: number;
        nextDate: string;
        amount: number;
      }>;
      const missingOneTimeAmount = missingOneTimeDeals.reduce(
        (sum, deal) => sum + (deal.amount ?? 0),
        0,
      );
      const dueInstallmentAmount = dueInstallments.reduce(
        (sum, installment) => sum + installment.amount,
        0,
      );

      /**
       * Every still-uninvoiced installment whose turn falls inside this
       * calendar year — not just the next one due. Counts toward "kvar att
       * fakturera i år" alongside missing one-time deals, so the column
       * reflects all money still to be billed rather than recurring lines only.
       */
      const remainingInstallmentsThisYear = companyDeals
        .filter(isInstallmentDeal)
        .reduce((sum, deal) => {
          const invoicedCount = invoicedInstallmentCount(deal, companyInvoices);
          const count = deal.installment_count ?? 0;
          const startDate = deal.billing_start_date ?? toDateOnly(today);
          const intervalMonths = deal.installment_interval_months ?? 1;
          let lineTotal = 0;
          for (let index = invoicedCount; index < count; index += 1) {
            const date = addMonths(
              parseDate(startDate),
              index * intervalMonths,
            );
            if (date.getFullYear() === year) {
              lineTotal += installmentAmountForIndex(deal, index + 1);
            }
          }
          return sum + lineTotal;
        }, 0);

      const nextInstallmentDate = earliestDate(
        dueInstallments.map((installment) => installment.nextDate),
      );
      const todayIso = toDateOnly(today);

      // Three independent sources can each want to be "what to invoice next":
      // a missing one-time deal (due immediately), a due installment, and the
      // next recurring line. Picking just one by fixed priority can hide a
      // more urgent item in a lower-priority category — e.g. a badly overdue
      // recurring line behind an installment that's merely due next month.
      // Instead: find the earliest date across all three, then merge in every
      // category that's actually due (on/off before today) so nothing overdue
      // gets dropped; if nothing is due yet, fall back to the single nearest
      // upcoming category, matching the old "what's coming up next" behavior.
      const recommendationCategories = [
        {
          date: missingOneTimeDeals.length > 0 ? todayIso : null,
          amount: missingOneTimeAmount,
          deals: missingOneTimeDeals.map((deal) => ({
            deal_id: deal.id,
            deal_name: deal.name,
            company_id: deal.company_id,
            company_name: deal.company_name,
            amount: deal.amount,
            next_invoice_date: todayIso,
          })),
        },
        {
          date: nextInstallmentDate,
          amount: dueInstallmentAmount,
          deals: dueInstallments.map(({ deal, amount, nextDate }) => ({
            deal_id: deal.id,
            deal_name: deal.name,
            company_id: deal.company_id,
            company_name: deal.company_name,
            amount,
            next_invoice_date: nextDate,
          })),
        },
        {
          date: nextInvoiceDate,
          amount: nextInvoiceAmount,
          deals: nextInvoiceDeals,
        },
      ];

      const recommendedDate = earliestDate(
        recommendationCategories
          .map((c) => c.date)
          .filter((d): d is string => Boolean(d)),
      );
      const dueCategories = recommendationCategories.filter(
        (c) => c.date !== null && c.date <= todayIso,
      );
      const activeCategories =
        dueCategories.length > 0
          ? dueCategories
          : recommendationCategories.filter((c) => c.date === recommendedDate);

      const recommendedDeals = activeCategories.flatMap((c) => c.deals);
      const recommendedAmount = activeCategories.reduce(
        (sum, c) => sum + c.amount,
        0,
      );
      const installmentDealIds = new Set(
        dueInstallments.map((installment) => String(installment.deal.id)),
      );
      const intervals = companyDeals.map(
        (deal) => deal.recurring_interval as RecurringInterval | null,
      );
      const hasUnlinkedInvoices = currentYearInvoices.some(
        (invoice) => invoice.deal_id == null,
      );
      const hasMissingInvoiceRows = currentYearInvoices.some(
        (invoice) => !hasInvoiceRows(invoice),
      );
      const billingWarnings: string[] = [];
      if (unanchoredRecurringDeals.length > 0) {
        billingWarnings.push(
          `Abonnemang saknar startdatum – schemat kan inte beräknas: ${unanchoredRecurringDeals
            .map((deal) => deal.name)
            .join(", ")}`,
        );
      }
      if (missingOneTimeDeals.length > 0) {
        billingWarnings.push(
          `Vunnen deal saknar matchande Fortnox-faktura: ${missingOneTimeDeals
            .map((deal) => deal.name)
            .join(", ")}`,
        );
      }
      if (dueInstallments.length > 0) {
        billingWarnings.push(
          `Delbetalning kvar att fakturera: ${dueInstallments
            .map(
              ({ deal, installmentIndex }) =>
                `${deal.name} (${installmentIndex}/${deal.installment_count})`,
            )
            .join(", ")}`,
        );
      }
      if (
        companyDeals.length > 1 &&
        hasUnlinkedInvoices &&
        (!hasRowBasedCoverage || hasMissingInvoiceRows)
      ) {
        billingWarnings.push(
          hasMissingInvoiceRows
            ? "Flera deals delar fakturamottagare, men Fortnox-fakturan saknar speglade fakturarader. Synka Fortnox och kontrollera deal-koppling."
            : "Flera deals delar fakturamottagare och minst en Fortnox-faktura saknar deal-koppling. Kontrollera vilka deals fakturan avser.",
        );
      }
      const missingDealIds = new Set(
        missingOneTimeDeals.map((deal) => String(deal.id)),
      );
      const recommendedDealIds = new Set(
        recommendedDeals.map((deal) => String(deal.deal_id)),
      );
      const unanchoredDealIds = new Set(
        unanchoredRecurringDeals.map((deal) => String(deal.id)),
      );
      const dealDetails: CustomerBillingRow["deals"] = companyDeals.map(
        (deal) => {
          const recurringAmount = deal.recurring_amount ?? 0;
          const isMissingOneTime = missingDealIds.has(String(deal.id));
          const dueInstallment = dueInstallments.find(
            (installment) => String(installment.deal.id) === String(deal.id),
          );
          const isNextRecommended = recommendedDealIds.has(String(deal.id));
          const dealNext =
            dealRecommendations.find(
              (recommendation) =>
                String(recommendation.deal_id) === String(deal.id),
            )?.next_invoice_date ?? null;

          return {
            deal_id: deal.id,
            deal_name: deal.name,
            company_id: deal.company_id,
            company_name: deal.company_name,
            one_time_amount: deal.amount ?? 0,
            recurring_amount: recurringAmount,
            recurring_interval: deal.recurring_interval,
            billing_schedule_type: deal.billing_schedule_type,
            installment_index: dueInstallment?.installmentIndex ?? null,
            installment_count: deal.installment_count,
            next_invoice_date: isMissingOneTime
              ? recommendedDate
              : dueInstallment
                ? dueInstallment.nextDate
                : dealNext,
            next_invoice_amount: isMissingOneTime
              ? (deal.amount ?? 0)
              : dueInstallment
                ? dueInstallment.amount
                : isNextRecommended
                  ? recurringAmount
                  : 0,
            status: isMissingOneTime
              ? "needs_invoice"
              : installmentDealIds.has(String(deal.id))
                ? "needs_invoice"
                : billingWarnings.length > 0
                  ? "needs_review"
                  : "ok",
            note: isMissingOneTime
              ? "Saknar matchande Fortnox-faktura"
              : unanchoredDealIds.has(String(deal.id))
                ? "Saknar startdatum – sätt Fakturering startar"
                : dueInstallment
                  ? `Delbetalning ${dueInstallment.installmentIndex}/${deal.installment_count}`
                  : dealNext
                    ? `Nästa återkommande faktura ${dealNext}`
                    : null,
          };
        },
      );

      return {
        company_id: billedCompanyId,
        company_name: billingCompanyName(companyDeals[0]),
        deal_count: companyDeals.length,
        monthly_recurring: monthly,
        expected_yearly: expectedYearly,
        billing_cadence: dueInstallments.length
          ? "installment"
          : getCadenceLabel(
              intervals,
              companyDeals.some(isInstallmentDeal) ? "installment" : "one_time",
            ),
        invoiced_year_to_date: invoicedYearToDate,
        paid_year_to_date: paidYearToDate,
        // Everything still to be billed this year, not just recurring lines:
        // a won one-time deal with no invoice is money left to invoice too,
        // and leaving it out made this column contradict the recommendation
        // sitting next to it ("Skicka faktura 5 000 kr" beside "0 kr kvar").
        remaining_to_invoice_this_year: Math.max(
          0,
          Math.round(
            remaining + missingOneTimeAmount + remainingInstallmentsThisYear,
          ),
        ),
        outstanding_balance: outstanding,
        has_overdue_invoice: overdueInvoices.length > 0,
        overdue_invoice_amount: overdueInvoiceAmount,
        last_invoice_date: lastInvoiceDate,
        next_invoice_date: recommendedDate,
        next_invoice_amount: recommendedAmount,
        next_invoice_deals: recommendedDeals,
        deals: dealDetails,
        billing_confidence:
          billingWarnings.length > 0 ? "needs_review" : "high",
        billing_warnings: billingWarnings,
        // "Klar" requires both invoice history and no unresolved subscription;
        // a line we couldn't schedule is an open question, not a finished job.
        billing_status: getBillingStatus(
          recommendedDate,
          today,
          lastInvoiceDate !== null && unanchoredRecurringDeals.length === 0,
        ),
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
          fully_invoiced: 0,
        };
      return (
        Number(b.has_overdue_invoice) - Number(a.has_overdue_invoice) ||
        statusScore[b.billing_status] - statusScore[a.billing_status] ||
        b.remaining_to_invoice_this_year - a.remaining_to_invoice_this_year ||
        b.monthly_recurring - a.monthly_recurring
      );
    });
};
