/**
 * Reconciles the manual subscription registry against the bookkeeping.
 *
 * The registry says what we *think* we pay; the bookkeeping (grouped by vendor
 * description) says what actually left the account. Matching is by alias —
 * uppercase substrings that catch a vendor's many descriptions ("CHATGPT MARS",
 * "OPENAI *CHATGPT SUBSCR" → both match alias "CHATGPT"). All pure so it's unit
 * tested without a database.
 */

export type CostRow = {
  description: string;
  month_count: number;
  total_cost: number;
  /** Net cost booked in the trailing 90 days (charges minus refunds). */
  cost_90d: number;
  last_date: string | null;
};

const normalize = (value: string) => value.trim().toUpperCase();

/** True if any alias appears as a substring of the (case-insensitive) description. */
export const matchesAlias = (
  description: string,
  aliases: string[],
): boolean => {
  const haystack = description.toUpperCase();
  return aliases.some((alias) => {
    const needle = normalize(alias);
    return needle.length > 0 && haystack.includes(needle);
  });
};

export type Reconciliation = {
  /** Net cost booked for this subscription over the last 90 days. */
  booked90d: number;
  /** That spread over 3 months — the booked monthly rate to compare against. */
  bookedMonthly: number;
  /** The vendor descriptions that matched. */
  matched: string[];
};

/** Sums the booked cost of every cost row whose description matches an alias. */
export const reconcile = (
  aliases: string[],
  rows: CostRow[],
): Reconciliation => {
  const matched = rows.filter((r) => matchesAlias(r.description, aliases));
  const booked90d = matched.reduce((sum, r) => sum + r.cost_90d, 0);
  return {
    booked90d,
    bookedMonthly: booked90d / 3,
    matched: matched.map((r) => r.description),
  };
};

export type DeviationLevel = "ok" | "off" | "missing";

/**
 * How the declared monthly cost compares to what's actually booked.
 * - "missing": declared, but nothing booked in the last 90 days
 * - "off": booked rate is well above or below what was declared (>60% out)
 * - "ok": close enough (öre-rounding, usage swings absorbed)
 */
export const deviation = (
  declaredMonthly: number,
  reconciliation: Reconciliation,
): DeviationLevel => {
  if (reconciliation.booked90d <= 0) return "missing";
  if (declaredMonthly <= 0) return "ok";
  const ratio = reconciliation.bookedMonthly / declaredMonthly;
  return ratio < 0.6 || ratio > 1.6 ? "off" : "ok";
};

/**
 * Booked recurring costs that match no subscription — candidates the registry
 * is missing. Only recurring (2+ months) and recently active (booked in the
 * last 90 days), so one-off purchases and dead vendors don't clutter it.
 */
export const findUnregistered = (
  rows: CostRow[],
  subscriptions: { aliases: string[] }[],
): CostRow[] => {
  const allAliases = subscriptions.flatMap((s) => s.aliases);
  return rows
    .filter(
      (r) =>
        r.month_count >= 2 &&
        r.cost_90d > 0 &&
        !matchesAlias(r.description, allAliases),
    )
    .sort((a, b) => b.cost_90d - a.cost_90d);
};
