import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Check, Clock, Minus, X } from "lucide-react";
import { useDataProvider } from "ra-core";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
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
import type { CustomerBillingRow, CustomerCoverage } from "../types";
import { formatCurrency, formatDate } from "./invoiceFormat";

const CADENCE_LABELS: Record<CustomerBillingRow["billing_cadence"], string> = {
  monthly: "Månadsvis",
  quarterly: "Kvartalsvis",
  yearly: "Årsvis",
  mixed: "Blandat",
};

const STATUS_LABELS: Record<CustomerBillingRow["billing_status"], string> = {
  ok: "Planerad",
  due_soon: "Dags snart",
  overdue: "Behöver faktureras",
  never_invoiced: "Ingen faktura",
};

const StatCard = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub ? (
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      ) : null}
    </CardContent>
  </Card>
);

const Yes = () => <Check className="mx-auto h-4 w-4 text-emerald-600" />;
const No = () => <X className="mx-auto h-4 w-4 text-destructive" />;
const NA = () => <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;

const StatusBadge = ({
  status,
}: {
  status: CustomerBillingRow["billing_status"];
}) => {
  if (status === "overdue" || status === "never_invoiced") {
    return <Badge variant="destructive">{STATUS_LABELS[status]}</Badge>;
  }
  if (status === "due_soon") {
    return <Badge variant="outline">{STATUS_LABELS[status]}</Badge>;
  }
  return <Badge variant="secondary">{STATUS_LABELS[status]}</Badge>;
};

/**
 * Kundtäckning — every won-deal customer and where they stand on billing:
 * Fortnox setup, invoices, recurring revenue and what remains to invoice.
 */
export const CustomerCoveragePage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const year = new Date().getFullYear();

  const { data: coverage, isPending } = useQuery({
    queryKey: ["customer-coverage"],
    queryFn: () => dataProvider.getCustomerCoverage(),
  });

  const { data: billing, isPending: isBillingPending } = useQuery({
    queryKey: ["customer-billing-overview"],
    queryFn: () => dataProvider.getCustomerBillingOverview(),
  });

  const billingByCompany = useMemo(
    () =>
      new Map(
        (billing ?? []).map((row) => [String(row.company_id), row] as const),
      ),
    [billing],
  );

  const rows = useMemo(() => {
    // Gaps first: not-a-customer, then recurring-without-contract, then the
    // customers where the next invoice needs attention, then the rest by value.
    const gapScore = (c: CustomerCoverage) =>
      (c.is_fortnox_customer ? 0 : 2) +
      (c.has_recurring && !c.has_contract ? 1 : 0) +
      (["overdue", "never_invoiced"].includes(
        billingByCompany.get(String(c.company_id))?.billing_status ?? "ok",
      )
        ? 2
        : billingByCompany.get(String(c.company_id))?.billing_status ===
            "due_soon"
          ? 1
          : 0);
    return [...(coverage ?? [])].sort(
      (a, b) => gapScore(b) - gapScore(a) || b.won_amount - a.won_amount,
    );
  }, [billingByCompany, coverage]);

  const summary = useMemo(() => {
    const coverageList = coverage ?? [];
    const billingList = billing ?? [];
    return {
      customers: coverageList.length,
      notInFortnox: coverageList.filter((c) => !c.is_fortnox_customer).length,
      recurringNoContract: coverageList.filter(
        (c) => c.has_recurring && !c.has_contract,
      ).length,
      mrr: coverageList.reduce((sum, c) => sum + c.recurring_monthly, 0),
      paidThisYear: billingList.reduce(
        (sum, row) => sum + row.paid_year_to_date,
        0,
      ),
      remainingThisYear: billingList.reduce(
        (sum, row) => sum + row.remaining_to_invoice_this_year,
        0,
      ),
      needsAction: billingList.filter(
        (row) =>
          row.billing_status === "overdue" ||
          row.billing_status === "never_invoiced" ||
          row.billing_status === "due_soon",
      ).length,
    };
  }, [billing, coverage]);

  const pending = isPending || isBillingPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Kundtäckning</h1>
        <p className="text-sm text-muted-foreground">
          Alla kunder med en vunnen deal, vad som är uppsatt i Fortnox och vad
          som återstår att fakturera.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vunna kunder" value={String(summary.customers)} />
        <StatCard
          label="Återkommande intäkter"
          value={`${formatCurrency(summary.mrr)}/mån`}
          sub={`${summary.recurringNoContract} utan Fortnox-avtal`}
        />
        <StatCard
          label={`Betalt ${year}`}
          value={formatCurrency(summary.paidThisYear)}
          sub="betalda Fortnox-fakturor ex moms"
        />
        <StatCard
          label={`Kvar att fakturera ${year}`}
          value={formatCurrency(summary.remainingThisYear)}
          sub={`${summary.needsAction} kunder behöver kollas`}
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {pending ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              Inga vunna deals ännu.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Företag</TableHead>
                  <TableHead className="text-right">Vunna</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Återk./mån</TableHead>
                  <TableHead className="text-right">Betalt {year}</TableHead>
                  <TableHead className="text-right">
                    Kvar att fakturera
                  </TableHead>
                  <TableHead>Nästa faktura</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Fortnox-kund</TableHead>
                  <TableHead className="text-center">Avtal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const invoice = billingByCompany.get(String(c.company_id));
                  return (
                    <TableRow key={c.company_id}>
                      <TableCell className="font-medium">
                        <Link
                          className="hover:underline"
                          to={`/companies/${c.company_id}/show`}
                        >
                          {c.company_name ?? "—"}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(c.won_amount)} vunnet värde
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.won_deal_count}
                      </TableCell>
                      <TableCell>
                        {invoice
                          ? CADENCE_LABELS[invoice.billing_cadence]
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.has_recurring
                          ? formatCurrency(c.recurring_monthly)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice
                          ? formatCurrency(invoice.paid_year_to_date)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {invoice
                          ? formatCurrency(
                              invoice.remaining_to_invoice_this_year,
                            )
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {invoice ? (
                          <div className="flex items-center gap-2">
                            {invoice.billing_status === "due_soon" ? (
                              <Clock className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <CalendarClock className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span>{formatDate(invoice.next_invoice_date)}</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {invoice ? (
                          <StatusBadge status={invoice.billing_status} />
                        ) : c.has_invoice ? (
                          <Badge variant="secondary">Fakturerad</Badge>
                        ) : (
                          <Badge variant="outline">Ej återkommande</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.is_fortnox_customer ? <Yes /> : <No />}
                      </TableCell>
                      <TableCell>
                        {!c.has_recurring ? (
                          <NA />
                        ) : c.has_contract ? (
                          <Yes />
                        ) : (
                          <No />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Fortnox-kopplingen visar om kunden är upplagd för fakturering. För
        återkommande kunder jämförs dealarnas årstakt med matchade
        Fortnox-fakturor ex moms på företagsnivå.
      </p>
    </div>
  );
};

CustomerCoveragePage.path = "/customer-coverage";
