/**
 * Runrate / liquidity maths for the Likviditet page.
 *
 * The point is a forward view: recurring revenue in, recurring cost out, and
 * what that nets to per month and by year-end. Everything is normalised to a
 * per-month figure so quarterly and yearly commitments compare on equal terms.
 */

export type RecurringInterval = "monthly" | "quarterly" | "yearly";

const INTERVAL_MONTHS: Record<RecurringInterval, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

/**
 * Normalises a recurring amount to a per-month figure. A missing interval is
 * treated as monthly — that's how the deals form defaults it, and a null
 * interval on a recurring amount is almost always a monthly retainer.
 */
export const monthlyAmount = (
  amount: number | null | undefined,
  interval: RecurringInterval | null | undefined,
): number => {
  if (!amount) return 0;
  const months = interval ? INTERVAL_MONTHS[interval] : 1;
  return amount / months;
};

/**
 * Whole months left in the calendar year AFTER the current one — the horizon a
 * "by year-end at this runrate" projection extends over. December returns 0
 * (nothing left to add this year).
 */
export const monthsRemainingInYear = (now: Date): number => 11 - now.getMonth();

/**
 * Projects a year-end figure: what we've actually booked so far plus the net
 * runrate carried across the remaining months. Deliberately conservative on
 * revenue — it ignores future one-off deals and counts only committed
 * recurring income.
 */
export const projectYearEnd = (
  ytdResult: number,
  netMonthly: number,
  monthsLeft: number,
): number => ytdResult + netMonthly * monthsLeft;
