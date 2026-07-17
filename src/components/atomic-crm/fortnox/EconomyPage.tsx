import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  RefreshCw,
  TrendingDown,
  Wallet,
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
import type { FortnoxSupplierInvoice } from "../types";
import { classifyRecurring, estimatedMonthlyCost } from "./economyFormat";
import {
  exVatAmount,
  formatCurrency,
  formatDate,
  STATUS_LABELS,
} from "./invoiceFormat";

type Cut = "all" | FortnoxSupplierInvoice["status"];

const CUTS: { key: Cut; label: string }[] = [
  { key: "all", label: "Alla" },
  { key: "unpaid", label: "Obetalda" },
  { key: "overdue", label: "Förfallna" },
  { key: "paid", label: "Betalda" },
];

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
  tone?: "danger";
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
              : "h-4 w-4 text-muted-foreground"
          }
        />
      </div>
      <div
        className={`mt-2 text-2xl font-semibold ${
          tone === "danger" ? "text-destructive" : ""
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

const STATUS_BADGE_VARIANT: Record<
  FortnoxSupplierInvoice["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  paid: "secondary",
  unpaid: "outline",
  overdue: "destructive",
  cancelled: "outline",
};

export const EconomyPage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [cut, setCut] = useState<Cut>("all");

  const { data: invoices, isPending } = useQuery({
    queryKey: ["fortnox", "supplier-invoices"],
    queryFn: () => dataProvider.getFortnoxSupplierInvoices(),
  });

  const { data: monthly } = useQuery({
    queryKey: ["fortnox", "cost-monthly"],
    queryFn: () => dataProvider.getFortnoxCostMonthly(),
  });

  const { data: recurring } = useQuery({
    queryKey: ["fortnox", "recurring-suppliers"],
    queryFn: () => dataProvider.getFortnoxRecurringSuppliers(),
  });

  const { mutate: sync, isPending: isSyncing } = useMutation({
    mutationFn: () => dataProvider.syncFortnoxSupplierInvoices(),
    onSuccess: ({ synced }) => {
      notify(`Synkade ${synced} leverantörsfakturor från Fortnox`, {
        type: "info",
      });
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
    },
    onError: () => notify("Kunde inte synka från Fortnox", { type: "error" }),
  });

  const stats = useMemo(() => {
    const rows = invoices ?? [];
    const thisMonth = new Date().toISOString().slice(0, 7);
    const thisYear = new Date().getFullYear().toString();

    const active = rows.filter((r) => r.status !== "cancelled");
    const costThisMonth = active
      .filter((r) => r.invoice_date?.startsWith(thisMonth))
      .reduce((sum, r) => sum + (r.total ?? 0), 0);
    const costThisYear = active
      .filter((r) => r.invoice_date?.startsWith(thisYear))
      .reduce((sum, r) => sum + (r.total ?? 0), 0);
    const unpaidBalance = active
      .filter((r) => r.status === "unpaid" || r.status === "overdue")
      .reduce((sum, r) => sum + (r.balance ?? 0), 0);
    const overdueCount = active.filter((r) => r.status === "overdue").length;

    return { costThisMonth, costThisYear, unpaidBalance, overdueCount };
  }, [invoices]);

  const subscriptions = useMemo(
    () =>
      (recurring ?? [])
        .filter((s) => classifyRecurring(s) === "subscription")
        .map((s) => ({ ...s, monthlyCost: estimatedMonthlyCost(s) }))
        .sort((a, b) => b.monthlyCost - a.monthlyCost),
    [recurring],
  );

  const subscriptionMonthlyTotal = subscriptions.reduce(
    (sum, s) => sum + s.monthlyCost,
    0,
  );

  const visible = useMemo(() => {
    const rows = invoices ?? [];
    if (cut === "all") return rows.filter((r) => r.status !== "cancelled");
    return rows.filter((row) => row.status === cut);
  }, [invoices, cut]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ekonomi — kostnader</h1>
          <p className="text-sm text-muted-foreground">
            Leverantörsfakturor speglade från Fortnox
          </p>
        </div>
        <Button variant="outline" onClick={() => sync()} disabled={isSyncing}>
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
          />
          Synka nu
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Kostnad denna månad (ink moms)"
          value={formatCurrency(stats.costThisMonth)}
          sub={`${formatCurrency(exVatAmount(stats.costThisMonth))} ex moms`}
          icon={TrendingDown}
        />
        <StatCard
          label="Kostnad i år (ink moms)"
          value={formatCurrency(stats.costThisYear)}
          sub={`${formatCurrency(exVatAmount(stats.costThisYear))} ex moms`}
          icon={Wallet}
        />
        <StatCard
          label="Obetalt till leverantörer"
          value={formatCurrency(stats.unpaidBalance)}
          sub={
            stats.overdueCount > 0
              ? `${stats.overdueCount} förfallna!`
              : "inget förfallet"
          }
          tone={stats.overdueCount > 0 ? "danger" : undefined}
          icon={AlertTriangle}
        />
        <StatCard
          label="Abonnemang"
          value={`${formatCurrency(subscriptionMonthlyTotal)}/mån`}
          sub={`${subscriptions.length} återkommande med fast belopp`}
          icon={CalendarClock}
        />
      </div>

      {subscriptions.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">Abonnemang</h2>
              <p className="text-sm text-muted-foreground">
                Leverantörer som återkommer med samma belopp. Månadskostnaden är
                uppskattad från fakturahistoriken.
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverantör</TableHead>
                  <TableHead className="text-right">Per månad</TableHead>
                  <TableHead className="text-right">Fakturor</TableHead>
                  <TableHead>Senaste faktura</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((s) => (
                  <TableRow key={s.supplier_number ?? s.supplier_name}>
                    <TableCell>{s.supplier_name ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.monthlyCost)}
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

      {monthly && monthly.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 pb-0">
              <h2 className="font-semibold">Kostnad per månad</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Månad</TableHead>
                  <TableHead className="text-right">Ex moms</TableHead>
                  <TableHead className="text-right">Ink moms</TableHead>
                  <TableHead className="text-right">Fakturor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...monthly].reverse().map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{m.month.slice(0, 7)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(m.total_cost_ex_vat)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(m.total_cost)}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.invoice_count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {CUTS.map(({ key, label }) => (
          <Button
            key={key}
            size="sm"
            variant={cut === key ? "default" : "outline"}
            onClick={() => setCut(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {isPending ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : visible.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Inga leverantörsfakturor i den här vyn. Klicka på Synka nu för att
              hämta från Fortnox.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverantör</TableHead>
                  <TableHead>Fakturanr</TableHead>
                  <TableHead>Fakturadatum</TableHead>
                  <TableHead>Förfaller</TableHead>
                  <TableHead className="text-right">Ex moms</TableHead>
                  <TableHead className="text-right">Ink moms</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((invoice) => (
                  <TableRow key={invoice.given_number}>
                    <TableCell>{invoice.supplier_name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {invoice.invoice_number ?? invoice.given_number}
                    </TableCell>
                    <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        exVatAmount(invoice.total, invoice.vat),
                        invoice.currency ?? "SEK",
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoice.total, invoice.currency ?? "SEK")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[invoice.status]}>
                        {STATUS_LABELS[invoice.status]}
                        {invoice.credit ? " · kredit" : ""}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fortnox äger leverantörsfakturorna — CRM:et speglar dem enbart för
        statistik. Ex moms använder Fortnox momsbelopp när det finns, annars
        antas 25 %.
      </p>
    </div>
  );
};

EconomyPage.path = "/economy";
