import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
} from "lucide-react";
import { useDataProvider, useNotify } from "ra-core";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
import { InvoiceStatusBadge } from "./InvoiceStatusBadge";
import {
  formatCurrency,
  formatDate,
  formatSyncedAt,
  type InvoiceStatus,
  STATUS_LABELS,
} from "./invoiceFormat";

type Cut = "all" | InvoiceStatus | "unsent";

const CUTS: { key: Cut; label: string }[] = [
  { key: "all", label: "Alla" },
  { key: "unpaid", label: "Obetalda" },
  { key: "overdue", label: "Förfallna" },
  { key: "unsent", label: "Ej utskickade" },
  { key: "paid", label: "Betalda" },
  { key: "cancelled", label: "Makulerade" },
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
  tone?: "danger" | "warning";
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

export const InvoicesPage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [cut, setCut] = useState<Cut>("unpaid");

  const { data: stats } = useQuery({
    queryKey: ["fortnox", "invoice-stats"],
    queryFn: () => dataProvider.getFortnoxInvoiceStats(),
  });

  const { data: invoices, isPending } = useQuery({
    queryKey: ["fortnox", "invoices"],
    queryFn: () => dataProvider.getFortnoxInvoices(),
  });

  const { mutate: sync, isPending: isSyncing } = useMutation({
    mutationFn: () => dataProvider.syncFortnoxInvoices(),
    onSuccess: ({ synced }) => {
      notify(`Synkade ${synced} fakturor från Fortnox`, { type: "info" });
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
    },
    onError: () => notify("Kunde inte synka från Fortnox", { type: "error" }),
  });

  const { mutate: send, isPending: isSending } = useMutation({
    mutationFn: (documentNumber: number) =>
      dataProvider.sendFortnoxInvoice(documentNumber),
    onSuccess: () => {
      notify("Fakturan skickades till kunden", { type: "info" });
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte skicka fakturan", { type: "error" }),
  });

  const visible = useMemo(() => {
    const rows = invoices ?? [];
    if (cut === "all") return rows;
    if (cut === "unsent") {
      return rows.filter((row) => !row.sent && row.status !== "cancelled");
    }
    return rows.filter((row) => row.status === cut);
  }, [invoices, cut]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Fakturor</h1>
          <p className="text-sm text-muted-foreground">
            Speglas från Fortnox · uppdaterad{" "}
            {formatSyncedAt(stats?.last_synced_at)}
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
          label="Obetalt"
          value={formatCurrency(stats?.unpaid_amount)}
          sub={`${stats?.unpaid_count ?? 0} fakturor`}
          icon={Clock}
        />
        <StatCard
          label="Förfallet"
          value={formatCurrency(stats?.overdue_amount)}
          sub={`${stats?.overdue_count ?? 0} fakturor`}
          tone={stats?.overdue_count ? "danger" : undefined}
          icon={AlertTriangle}
        />
        <StatCard
          label="Ej utskickade"
          value={String(stats?.unsent_count ?? 0)}
          sub={formatCurrency(stats?.unsent_amount)}
          icon={Send}
        />
        <StatCard
          label="Betalt"
          value={formatCurrency(stats?.paid_amount)}
          sub={`${stats?.paid_count ?? 0} fakturor`}
          icon={CheckCircle2}
        />
      </div>

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
              Inga fakturor i den här vyn.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr</TableHead>
                  <TableHead>Kund</TableHead>
                  <TableHead>Fakturadatum</TableHead>
                  <TableHead>Förfaller</TableHead>
                  <TableHead className="text-right">Belopp</TableHead>
                  <TableHead className="text-right">Kvar att betala</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((invoice) => (
                  <TableRow key={invoice.document_number}>
                    <TableCell className="font-mono text-xs">
                      {invoice.document_number}
                    </TableCell>
                    <TableCell>
                      {invoice.company_id ? (
                        <Link
                          className="hover:underline"
                          to={`/companies/${invoice.company_id}/show`}
                        >
                          {invoice.customer_name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {invoice.customer_name ?? "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(invoice.total, invoice.currency ?? "SEK")}
                    </TableCell>
                    <TableCell className="text-right">
                      {invoice.status === "paid"
                        ? "—"
                        : formatCurrency(
                            invoice.balance,
                            invoice.currency ?? "SEK",
                          )}
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge invoice={invoice} />
                    </TableCell>
                    <TableCell className="text-right">
                      {!invoice.sent && invoice.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isSending}
                          onClick={() => send(invoice.document_number)}
                        >
                          <Send className="mr-2 h-3 w-3" />
                          Skicka
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fortnox äger fakturorna. CRM:et speglar dem och kan skapa och skicka —
        men bokför aldrig. Statusen {Object.values(STATUS_LABELS).join(", ")}{" "}
        kommer från Fortnox egna uppgifter.
      </p>
    </div>
  );
};

InvoicesPage.path = "/invoices";
