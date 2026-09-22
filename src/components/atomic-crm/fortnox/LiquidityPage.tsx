import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarRange,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useDataProvider } from "ra-core";
import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { CrmDataProvider } from "../providers/types";
import { formatCurrency } from "./invoiceFormat";
import {
  monthlyAmount,
  monthsRemainingInYear,
  projectYearEnd,
} from "./liquidity";

const INTERVAL_LABELS: Record<string, string> = {
  monthly: "per månad",
  quarterly: "per kvartal",
  yearly: "per år",
};

const StatCard = ({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "positive";
  icon: React.ElementType;
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon
          className={
            tone === "danger"
              ? "h-4 w-4 text-destructive"
              : tone === "positive"
                ? "h-4 w-4 text-emerald-600"
                : "h-4 w-4 text-muted-foreground"
          }
        />
      </div>
      <div
        className={`mt-2 text-2xl font-semibold ${
          tone === "danger"
            ? "text-destructive"
            : tone === "positive"
              ? "text-emerald-600"
              : ""
        }`}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </CardContent>
  </Card>
);

export const LiquidityPage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const now = new Date();
  const thisYear = now.getFullYear().toString();

  const { data: revenueDeals } = useQuery({
    queryKey: ["liquidity", "recurring-revenue"],
    queryFn: () => dataProvider.getRecurringRevenue(),
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: () => dataProvider.getSubscriptions(),
  });

  const { data: result } = useQuery({
    queryKey: ["fortnox", "result-monthly"],
    queryFn: () => dataProvider.getFortnoxResultMonthly(),
  });

  // Recurring income, normalised to a per-month figure. getRecurringRevenue
  // also returns one-time deals now (Kundtäckning needs those too), so filter
  // back down to genuinely recurring lines here — Likviditet is specifically
  // about recurring revenue vs. recurring cost, not one-off project value.
  const revenue = useMemo(() => {
    const rows = (revenueDeals ?? [])
      .filter((d) => (d.recurring_amount ?? 0) > 0)
      .map((d) => ({
        ...d,
        monthly: monthlyAmount(d.recurring_amount, d.recurring_interval),
      }));
    const monthly = rows.reduce((sum, r) => sum + r.monthly, 0);
    return { rows: rows.sort((a, b) => b.monthly - a.monthly), monthly };
  }, [revenueDeals]);

  // Recurring cost = the ACTIVE subscriptions in the manual registry — the
  // source of truth for what we actually pay for right now. Handles plan
  // switches (Pro↔Max) and cancellations the bookkeeping can't infer alone.
  const cost = useMemo(() => {
    const subs = (subscriptions ?? [])
      .filter((s) => s.status === "active")
      .map((s) => ({ name: s.name, monthly: s.monthly_amount }))
      .sort((a, b) => b.monthly - a.monthly);
    const monthly = subs.reduce((sum, s) => sum + s.monthly, 0);
    return { subs, monthly };
  }, [subscriptions]);

  const netMonthly = revenue.monthly - cost.monthly;

  const ytdResult = useMemo(
    () =>
      (result ?? [])
        .filter((r) => r.month.startsWith(thisYear))
        .reduce((sum, r) => sum + r.result, 0),
    [result, thisYear],
  );

  const monthsLeft = monthsRemainingInYear(now);
  const projected = projectYearEnd(ytdResult, netMonthly, monthsLeft);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Likviditet</h1>
        <p className="text-sm text-muted-foreground">
          Återkommande intäkter mot återkommande kostnader — er runrate och vad
          den ger vid årsskiftet.
        </p>
      </div>

      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        data-tour="liquidity-kpi"
      >
        <StatCard
          label="Återkommande intäkter"
          value={`${formatCurrency(revenue.monthly)}/mån`}
          sub={`${revenue.rows.length} avtalskunder`}
          tone="positive"
          icon={ArrowUpRight}
        />
        <StatCard
          label="Återkommande kostnader"
          value={`${formatCurrency(cost.monthly)}/mån`}
          sub={`${cost.subs.length} aktiva abonnemang`}
          icon={ArrowDownRight}
        />
        <StatCard
          label="Netto runrate"
          value={`${formatCurrency(netMonthly)}/mån`}
          sub={`${formatCurrency(netMonthly * 12)}/år i årstakt`}
          tone={netMonthly >= 0 ? "positive" : "danger"}
          icon={netMonthly >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label={`Prognos årsslut ${thisYear}`}
          value={formatCurrency(projected)}
          sub={
            monthsLeft > 0
              ? `resultat hittills + runrate × ${monthsLeft} mån`
              : "året är slut"
          }
          tone={projected >= 0 ? "positive" : "danger"}
          icon={Scale}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <CalendarRange className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div className="space-y-1 text-sm">
              <p>
                Hittills i år är resultatet{" "}
                <strong>{formatCurrency(ytdResult)}</strong> enligt bokföringen.
              </p>
              <p>
                Håller nuvarande runrate på{" "}
                <strong>{formatCurrency(netMonthly)}/mån</strong> netto landar
                ni på cirka <strong>{formatCurrency(projected)}</strong> vid
                årsskiftet ({monthsLeft} mån kvar).
              </p>
              <p className="text-muted-foreground">
                Prognosen är medvetet försiktig: den räknar bara med redan
                signerade återkommande intäkter, inga framtida engångsaffärer.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-tour="liquidity-income">
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">Återkommande intäkter</h2>
              <p className="text-sm text-muted-foreground">
                Vunna avtalskunder.
              </p>
            </div>
            {revenue.rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Inga vunna avtal med återkommande belopp ännu.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kund</TableHead>
                    <TableHead>Belopp</TableHead>
                    <TableHead className="text-right">Per månad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.rows.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">
                        {d.company_name ?? d.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatCurrency(d.recurring_amount)}{" "}
                        {INTERVAL_LABELS[d.recurring_interval ?? "monthly"]}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(d.monthly)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card data-tour="liquidity-costs">
          <CardContent className="p-0">
            <div className="flex items-start justify-between p-4 pb-0">
              <div>
                <h2 className="font-semibold">Återkommande kostnader</h2>
                <p className="text-sm text-muted-foreground">
                  Aktiva abonnemang ur registret.
                </p>
              </div>
              <a
                href="/#/subscriptions"
                className="text-sm text-muted-foreground underline hover:text-foreground"
              >
                Hantera
              </a>
            </div>
            {cost.subs.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Inga aktiva abonnemang. Lägg till dem under Abonnemang.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leverantör</TableHead>
                    <TableHead className="text-right">Per månad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cost.subs.map((s) => (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(s.monthly)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Intäkter kommer från vunna deals med återkommande belopp; kostnader från
        de aktiva abonnemangen i registret (stäms av mot bokföringen under
        Abonnemang).
      </p>
    </div>
  );
};

LiquidityPage.path = "/liquidity";
