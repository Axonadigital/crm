import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useDataProvider, useNotify } from "ra-core";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { CrmDataProvider } from "../providers/types";
import type { FortnoxNamedSubscription } from "../types";
import { classifyRecurring, estimatedMonthlyCost } from "./economyFormat";
import { formatCurrency, formatDate } from "./invoiceFormat";

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

/** A named subscription enriched with its classification + monthly cost. */
type Subscription = FortnoxNamedSubscription & {
  kind: ReturnType<typeof classifyRecurring>;
  monthlyCost: number;
};

export const EconomyPage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear().toString();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const { data: result, isPending: resultPending } = useQuery({
    queryKey: ["fortnox", "result-monthly"],
    queryFn: () => dataProvider.getFortnoxResultMonthly(),
  });

  const { data: subscriptionsRaw } = useQuery({
    queryKey: ["fortnox", "named-subscriptions"],
    queryFn: () => dataProvider.getFortnoxNamedSubscriptions(),
  });

  const { data: byAccount } = useQuery({
    queryKey: ["fortnox", "cost-by-account"],
    queryFn: () => dataProvider.getFortnoxCostByAccount(),
  });

  const { data: supplierInvoices } = useQuery({
    queryKey: ["fortnox", "supplier-invoices"],
    queryFn: () => dataProvider.getFortnoxSupplierInvoices(),
  });

  const { mutate: sync, isPending: isSyncing } = useMutation({
    mutationFn: () => dataProvider.syncFortnoxVouchers(),
    onSuccess: ({ synced, remaining }) => {
      notify(
        remaining > 0
          ? `Synkade ${synced} verifikationer — ${remaining} kvar, kör igen`
          : `Synkade ${synced} verifikationer från Fortnox`,
        { type: "info" },
      );
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
    },
    onError: () => notify("Kunde inte synka från Fortnox", { type: "error" }),
  });

  // Year-to-date totals from the result report. All figures come straight from
  // the bookkeeping, so revenue − cost reconciles to Fortnox's own result.
  const totals = useMemo(() => {
    const rows = (result ?? []).filter((r) => r.month.startsWith(thisYear));
    return rows.reduce(
      (acc, r) => ({
        revenue: acc.revenue + r.revenue,
        cost: acc.cost + r.cost,
        result: acc.result + r.result,
      }),
      { revenue: 0, cost: 0, result: 0 },
    );
  }, [result, thisYear]);

  const subscriptions = useMemo<Subscription[]>(
    () =>
      (subscriptionsRaw ?? [])
        .map((s) => ({
          ...s,
          kind: classifyRecurring(s),
          monthlyCost: estimatedMonthlyCost(s),
        }))
        .sort((a, b) => b.monthlyCost - a.monthlyCost),
    [subscriptionsRaw],
  );

  const fixedSubscriptions = subscriptions.filter(
    (s) => s.kind === "subscription",
  );
  const subscriptionMonthlyTotal = fixedSubscriptions.reduce(
    (sum, s) => sum + s.monthlyCost,
    0,
  );

  // Newly-recurring costs: a subscription whose first charge landed in the last
  // ~45 days. The bank (Lunar) flags a brand-new charge; this catches the
  // moment it turns into a recurring commitment — the point to check it's
  // intended. Complements, doesn't duplicate, the bank alert.
  const newlyRecurring = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 45);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    return (subscriptionsRaw ?? []).filter(
      (s) => s.first_invoice_date != null && s.first_invoice_date >= cutoffIso,
    );
  }, [subscriptionsRaw]);

  const unpaidSupplier = useMemo(() => {
    const rows = (supplierInvoices ?? []).filter(
      (r) => r.status === "unpaid" || r.status === "overdue",
    );
    const balance = rows.reduce((sum, r) => sum + (r.balance ?? 0), 0);
    const overdue = rows.filter((r) => r.status === "overdue").length;
    return { rows, balance, overdue };
  }, [supplierInvoices]);

  return (
    <div className="space-y-6" data-tour="economy-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ekonomi</h1>
          <p className="text-sm text-muted-foreground">
            Speglat ur Fortnox bokföring — samma siffror som resultatrapporten
          </p>
        </div>
        <Button variant="outline" onClick={() => sync()} disabled={isSyncing}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
          />
          Synka nu
        </Button>
      </div>

      {newlyRecurring.length > 0 && !bannerDismissed ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {newlyRecurring.length === 1
                ? "Ny återkommande kostnad upptäckt"
                : `${newlyRecurring.length} nya återkommande kostnader upptäckta`}
            </p>
            <p className="mt-0.5">
              {newlyRecurring
                .map((s) => s.name ?? s.normalized_name)
                .join(", ")}{" "}
              — kontrollera att abonnemanget är avsett.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            className="rounded p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40"
            aria-label="Stäng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Resultat ${thisYear}`}
          value={formatCurrency(totals.result)}
          sub="intäkter − kostnader, ur bokföringen"
          tone={totals.result >= 0 ? "positive" : "danger"}
          icon={totals.result >= 0 ? TrendingUp : TrendingDown}
        />
        <StatCard
          label={`Intäkter ${thisYear}`}
          value={formatCurrency(totals.revenue)}
          icon={TrendingUp}
        />
        <StatCard
          label={`Kostnader ${thisYear}`}
          value={formatCurrency(totals.cost)}
          icon={Wallet}
        />
        <StatCard
          label="Abonnemang"
          value={`${formatCurrency(subscriptionMonthlyTotal)}/mån`}
          sub={`${fixedSubscriptions.length} med fast belopp`}
          icon={CalendarClock}
        />
      </div>

      {subscriptions.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">Abonnemang &amp; återkommande</h2>
              <p className="text-sm text-muted-foreground">
                Avlästa direkt ur bokföringen och namngivna per leverantör.
                Fasta belopp är abonnemang; rörliga varierar mellan månaderna.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverantör</TableHead>
                  <TableHead className="text-right">Per månad</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Antal</TableHead>
                  <TableHead>Senast</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((s) => (
                  <TableRow key={s.normalized_name}>
                    <TableCell className="font-medium">
                      {s.name ?? s.normalized_name}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.monthlyCost)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.kind === "subscription" ? "secondary" : "outline"
                        }
                      >
                        {s.kind === "subscription" ? "Abonnemang" : "Rörligt"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.invoice_count}
                    </TableCell>
                    <TableCell>{formatDate(s.last_invoice_date)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">Resultat per månad</h2>
            </div>
            {resultPending ? (
              <div className="space-y-2 p-6">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (result ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                Inga verifikationer speglade ännu. Klicka Synka nu.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Månad</TableHead>
                    <TableHead className="text-right">Intäkter</TableHead>
                    <TableHead className="text-right">Kostnader</TableHead>
                    <TableHead className="text-right">Resultat</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...(result ?? [])].reverse().map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.month.slice(0, 7)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(m.revenue)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(m.cost)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          m.result < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatCurrency(m.result)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">Kostnad per konto</h2>
              <p className="text-sm text-muted-foreground">
                Vart pengarna tar vägen (BAS-konto).
              </p>
            </div>
            {(byAccount ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">—</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Konto</TableHead>
                    <TableHead>Benämning</TableHead>
                    <TableHead className="text-right">Kostnad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(byAccount ?? []).slice(0, 15).map((a) => (
                    <TableRow key={a.account}>
                      <TableCell className="font-mono text-xs">
                        {a.account}
                      </TableCell>
                      <TableCell>{a.account_description ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(a.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {unpaidSupplier.rows.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between p-4 pb-0">
              <div>
                <h2 className="font-semibold">Obetalda leverantörsfakturor</h2>
                <p className="text-sm text-muted-foreground">
                  Skulder till leverantörer som ännu inte betalats.
                </p>
              </div>
              {unpaidSupplier.overdue > 0 ? (
                <Badge variant="destructive">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {unpaidSupplier.overdue} förfallna
                </Badge>
              ) : null}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverantör</TableHead>
                  <TableHead>Förfaller</TableHead>
                  <TableHead className="text-right">Kvar att betala</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unpaidSupplier.rows.map((invoice) => (
                  <TableRow key={invoice.given_number}>
                    <TableCell>{invoice.supplier_name ?? "—"}</TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        invoice.balance,
                        invoice.currency ?? "SEK",
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Fortnox äger bokföringen — CRM:et speglar verifikationerna read-only.
        Resultatet beräknas som intäkter (konto 3xxx) minus kostnader
        (4xxx–8xxx) och stämmer med Fortnox resultatrapport.
      </p>
    </div>
  );
};

EconomyPage.path = "/economy";
