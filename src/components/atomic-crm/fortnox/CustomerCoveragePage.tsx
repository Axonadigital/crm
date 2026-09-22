import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Minus, X } from "lucide-react";
import { useDataProvider } from "ra-core";
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
import { TourHelpButton } from "../tour";
import type { CustomerCoverage } from "../types";
import {
  BILLING_CADENCE_LABELS,
  BillingStatusBadge,
  NextInvoiceChip,
} from "./billingDisplay";
import { CompanyInvoiceList } from "./CompanyInvoiceList";
import { formatCurrency } from "./invoiceFormat";

const StatCard = ({
  label,
  value,
  sub,
  tone,
  dataTour,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger";
  dataTour?: string;
}) => (
  <Card data-tour={dataTour}>
    <CardContent className="pt-6">
      <div className="text-sm text-muted-foreground">{label}</div>
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

const Yes = () => <Check className="mx-auto h-4 w-4 text-emerald-600" />;
const No = () => <X className="mx-auto h-4 w-4 text-destructive" />;
const NA = () => <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;

/**
 * Kundtäckning — every won-deal customer and where they stand on billing:
 * Fortnox setup, invoices, recurring revenue and what remains to invoice.
 */
export const CustomerCoveragePage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    () => new Set(),
  );
  const year = new Date().getFullYear();

  const toggleExpanded = (companyId: string) => {
    setExpandedCompanies((current) => {
      const next = new Set(current);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const { data: coverage, isPending } = useQuery({
    queryKey: ["customer-coverage"],
    queryFn: () => dataProvider.getCustomerCoverage(),
  });

  const {
    data: billing,
    error: billingError,
    isPending: isBillingPending,
  } = useQuery({
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
      (billingByCompany.get(String(c.company_id))?.has_overdue_invoice
        ? 3
        : 0) +
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
      outstanding: billingList.reduce(
        (sum, row) => sum + row.outstanding_balance,
        0,
      ),
      overdueCustomers: billingList.filter((row) => row.has_overdue_invoice)
        .length,
      needsAction: billingList.filter(
        (row) =>
          row.has_overdue_invoice ||
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
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold">Kundtäckning</h1>
          <TourHelpButton
            tourId="customer-coverage"
            label="Så läser du Kundtäckning"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Alla kunder med en vunnen deal, vad som är uppsatt i Fortnox och vad
          som återstår att fakturera.
        </p>
      </div>

      <div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        data-tour="coverage-kpi"
      >
        <StatCard label="Vunna kunder" value={String(summary.customers)} />
        <StatCard
          label="Återkommande intäkter"
          value={`${formatCurrency(summary.mrr)}/mån`}
          sub={`${summary.recurringNoContract} utan automatiskt Fortnox-avtal`}
        />
        <StatCard
          label={`Betalt ${year}`}
          value={formatCurrency(summary.paidThisYear)}
          sub="betalda Fortnox-fakturor ex moms"
        />
        <StatCard
          dataTour="coverage-unpaid-kpi"
          label="Obetalt"
          value={formatCurrency(summary.outstanding)}
          sub={
            summary.overdueCustomers > 0
              ? `${summary.overdueCustomers} kunder har förfallen faktura`
              : "fakturerat men ännu inte betalt"
          }
          tone={summary.overdueCustomers > 0 ? "danger" : undefined}
        />
        <StatCard
          dataTour="coverage-remaining-kpi"
          label={`Kvar att fakturera ${year}`}
          value={formatCurrency(summary.remainingThisYear)}
          sub={`${summary.needsAction} kunder behöver kollas`}
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {billingError ? (
            <div className="border-b bg-destructive/5 p-4 text-sm text-destructive">
              Kunde inte läsa faktureringsdata från Fortnox-spegeln. Synka
              Supabase-migrationer och Fortnox-funktioner om det här ligger kvar
              efter omladdning.
            </div>
          ) : null}
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
                  <TableHead
                    className="text-right"
                    data-tour="coverage-col-unpaid"
                  >
                    Obetalt
                  </TableHead>
                  <TableHead
                    className="text-right"
                    data-tour="coverage-col-remaining"
                  >
                    Kvar att fakturera
                  </TableHead>
                  <TableHead>Nästa faktura</TableHead>
                  <TableHead>Rekommendation</TableHead>
                  <TableHead data-tour="coverage-col-status">Status</TableHead>
                  <TableHead className="text-center">Fortnox-kund</TableHead>
                  <TableHead
                    className="text-center"
                    data-tour="coverage-col-contract"
                  >
                    Avtal
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c, rowIndex) => {
                  const invoice = billingByCompany.get(String(c.company_id));
                  const expanded = expandedCompanies.has(String(c.company_id));
                  const missingInvoiceWarning =
                    invoice?.billing_warnings.find((warning) =>
                      warning.includes("saknar matchande Fortnox-faktura"),
                    ) ?? null;
                  return (
                    <Fragment key={c.company_id}>
                      <TableRow>
                        <TableCell className="font-medium">
                          <div className="flex items-start gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="mt-0.5 h-6 w-6"
                              data-tour={
                                rowIndex === 0 ? "coverage-expand" : undefined
                              }
                              onClick={() =>
                                toggleExpanded(String(c.company_id))
                              }
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${
                                  expanded ? "rotate-180" : ""
                                }`}
                              />
                              <span className="sr-only">Visa deals</span>
                            </Button>
                            <div>
                              <Link
                                className="hover:underline"
                                to={`/companies/${c.company_id}/show`}
                              >
                                {c.company_name ?? "—"}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {formatCurrency(c.won_amount)} vunnet värde
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {c.won_deal_count}
                        </TableCell>
                        <TableCell>
                          {invoice
                            ? BILLING_CADENCE_LABELS[invoice.billing_cadence]
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
                          {!invoice || invoice.outstanding_balance <= 0 ? (
                            "—"
                          ) : (
                            <span
                              className={
                                invoice.has_overdue_invoice
                                  ? "font-medium text-destructive"
                                  : "text-amber-600 dark:text-amber-500"
                              }
                              title={
                                invoice.has_overdue_invoice
                                  ? "Förfallen — betalning har passerat förfallodatum"
                                  : "Fakturerat, ännu inte förfallet"
                              }
                            >
                              {formatCurrency(invoice.outstanding_balance)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {invoice
                            ? formatCurrency(
                                invoice.remaining_to_invoice_this_year,
                              )
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {invoice?.billing_confidence === "needs_review" ? (
                            <Badge variant="destructive">Kontrollera</Badge>
                          ) : invoice && invoice.next_invoice_date ? (
                            <NextInvoiceChip
                              date={invoice.next_invoice_date}
                              status={invoice.billing_status}
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="min-w-56">
                          {invoice && invoice.next_invoice_date ? (
                            <div className="space-y-1">
                              {missingInvoiceWarning ? (
                                <div className="text-sm font-medium text-destructive">
                                  Skicka faktura{" "}
                                  {formatCurrency(invoice.next_invoice_amount)}
                                </div>
                              ) : invoice.billing_confidence ===
                                "needs_review" ? (
                                <Badge variant="destructive">
                                  Kontrollera fakturor
                                </Badge>
                              ) : (
                                <div className="text-sm font-medium">
                                  Fakturera{" "}
                                  {formatCurrency(invoice.next_invoice_amount)}
                                </div>
                              )}
                              <div className="text-xs text-muted-foreground">
                                {missingInvoiceWarning ??
                                  invoice.billing_warnings[0] ??
                                  (invoice.next_invoice_deals.length > 0
                                    ? invoice.next_invoice_deals
                                        .map((deal) => deal.deal_name)
                                        .join(", ")
                                    : "Inga deals hittades för datumet")}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {invoice?.has_overdue_invoice ? (
                              <Badge
                                variant="destructive"
                                className="gap-1"
                                title="Obetald Fortnox-faktura har passerat förfallodatum"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Förfallen{" "}
                                {formatCurrency(invoice.overdue_invoice_amount)}
                              </Badge>
                            ) : null}
                            {invoice ? (
                              <BillingStatusBadge
                                status={invoice.billing_status}
                              />
                            ) : billingError && c.has_recurring ? (
                              <Badge variant="destructive">
                                Faktureringsdata saknas
                              </Badge>
                            ) : c.has_invoice ? (
                              <Badge variant="secondary">Fakturerad</Badge>
                            ) : (
                              <Badge variant="outline">Ej återkommande</Badge>
                            )}
                          </div>
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
                      {expanded ? (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={12} className="space-y-4 p-0">
                            {invoice?.deals?.length ? (
                              <div className="grid grid-cols-[minmax(220px,1fr)_120px_120px_150px_minmax(220px,1.2fr)] gap-3 px-4 py-3 text-xs md:px-12">
                                <div className="font-medium text-muted-foreground">
                                  Deal
                                </div>
                                <div className="text-right font-medium text-muted-foreground">
                                  Engång
                                </div>
                                <div className="text-right font-medium text-muted-foreground">
                                  Återk.
                                </div>
                                <div className="font-medium text-muted-foreground">
                                  Nästa
                                </div>
                                <div className="font-medium text-muted-foreground">
                                  Notis
                                </div>
                                {invoice.deals.map((deal) => (
                                  <Fragment key={String(deal.deal_id)}>
                                    <div>
                                      <Link
                                        className="font-medium hover:underline"
                                        to={`/deals/${deal.deal_id}/show`}
                                      >
                                        {deal.deal_name}
                                      </Link>
                                      {deal.company_name &&
                                      deal.company_name !== c.company_name ? (
                                        <div className="text-muted-foreground">
                                          {deal.company_name}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="text-right">
                                      {deal.one_time_amount
                                        ? formatCurrency(deal.one_time_amount)
                                        : "—"}
                                    </div>
                                    <div className="text-right">
                                      {deal.recurring_amount
                                        ? formatCurrency(deal.recurring_amount)
                                        : deal.billing_schedule_type ===
                                              "installment" &&
                                            deal.installment_count
                                          ? `${deal.installment_count} delar`
                                          : "—"}
                                    </div>
                                    <div>
                                      {deal.next_invoice_date
                                        ? deal.next_invoice_date
                                        : "—"}
                                    </div>
                                    <div>
                                      {deal.status === "needs_invoice" ? (
                                        <span className="font-medium text-destructive">
                                          {deal.billing_schedule_type ===
                                            "installment" &&
                                          deal.installment_index &&
                                          deal.installment_count
                                            ? `Delbetalning ${deal.installment_index}/${deal.installment_count}: `
                                            : "Skicka faktura "}
                                          {formatCurrency(
                                            deal.next_invoice_amount,
                                          )}
                                        </span>
                                      ) : (
                                        (deal.note ?? "OK")
                                      )}
                                    </div>
                                  </Fragment>
                                ))}
                              </div>
                            ) : null}
                            <div
                              className="px-4 pb-4 md:px-12"
                              data-tour={
                                rowIndex === 0 ? "coverage-invoices" : undefined
                              }
                            >
                              <div className="mb-1 text-xs font-medium text-muted-foreground">
                                Fakturor i Fortnox
                              </div>
                              <CompanyInvoiceList companyId={c.company_id} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
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
