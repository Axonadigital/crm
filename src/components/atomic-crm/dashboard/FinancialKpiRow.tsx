import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Coins, PiggyBank, Wallet } from "lucide-react";
import { useDataProvider } from "ra-core";
import { memo } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import {
  classifyRecurring,
  estimatedMonthlyCost,
} from "../fortnox/economyFormat";
import { monthlyAmount } from "../fortnox/liquidity";
import type { CrmDataProvider } from "../providers/types";
import { KpiCard } from "./KpiCard";

/** Compact SEK, matching the sales KPI row: 79 373 → "79k". */
function sek(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString("sv-SE", {
      maximumFractionDigits: 1,
    })} MSEK`;
  }
  if (abs >= 10_000) {
    return `${Math.round(value / 1_000).toLocaleString("sv-SE")}k kr`;
  }
  return `${Math.round(value).toLocaleString("sv-SE")} kr`;
}

/**
 * A financial glance at the top of the dashboard: result this year, MRR, net
 * runrate and outstanding receivables — the Ekonomi/Likviditet headline numbers
 * lifted to the front page. All read from data already mirrored, so it costs
 * nothing new.
 */
export const FinancialKpiRow = memo(() => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const thisYear = new Date().getFullYear().toString();

  const result = useQuery({
    queryKey: ["fortnox", "result-monthly"],
    queryFn: () => dataProvider.getFortnoxResultMonthly(),
  });
  const revenue = useQuery({
    queryKey: ["liquidity", "recurring-revenue"],
    queryFn: () => dataProvider.getRecurringRevenue(),
  });
  const subs = useQuery({
    queryKey: ["fortnox", "named-subscriptions"],
    queryFn: () => dataProvider.getFortnoxNamedSubscriptions(),
  });
  const invoices = useQuery({
    queryKey: ["fortnox", "supplier-and-invoices", "list"],
    queryFn: () => dataProvider.getFortnoxInvoices(),
  });

  const isPending =
    result.isPending ||
    revenue.isPending ||
    subs.isPending ||
    invoices.isPending;

  if (isPending) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const yearResult = (result.data ?? [])
    .filter((r) => r.month.startsWith(thisYear))
    .reduce((sum, r) => sum + r.result, 0);

  const mrr = (revenue.data ?? []).reduce(
    (sum, d) => sum + monthlyAmount(d.recurring_amount, d.recurring_interval),
    0,
  );

  const fixedCostMonthly = (subs.data ?? [])
    .filter((s) => classifyRecurring(s) === "subscription")
    .reduce((sum, s) => sum + estimatedMonthlyCost(s), 0);

  const netRunrate = mrr - fixedCostMonthly;

  const unpaid = (invoices.data ?? []).filter(
    (i) => i.status === "unpaid" || i.status === "overdue",
  );
  const unpaidBalance = unpaid.reduce((sum, i) => sum + (i.balance ?? 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KpiCard
        title={`Resultat ${thisYear}`}
        value={sek(yearResult)}
        icon={PiggyBank}
      />
      <KpiCard
        title="MRR (återkommande)"
        value={`${sek(mrr)}/mån`}
        icon={Coins}
      />
      <KpiCard
        title="Netto runrate"
        value={`${sek(netRunrate)}/mån`}
        icon={CalendarClock}
      />
      <KpiCard
        title={
          unpaid.length > 0 ? `Obetalt (${unpaid.length} fakt.)` : "Obetalt"
        }
        value={sek(unpaidBalance)}
        icon={Wallet}
      />
    </div>
  );
});
