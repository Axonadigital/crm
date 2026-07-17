import { useQuery } from "@tanstack/react-query";
import { Check, Minus, X } from "lucide-react";
import { useDataProvider } from "ra-core";
import { useMemo } from "react";

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
import type { CustomerCoverage } from "../types";
import { formatCurrency } from "./invoiceFormat";

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </CardContent>
  </Card>
);

const Yes = () => <Check className="mx-auto h-4 w-4 text-emerald-600" />;
const No = () => <X className="mx-auto h-4 w-4 text-destructive" />;
const NA = () => <Minus className="mx-auto h-4 w-4 text-muted-foreground" />;

/**
 * Kundtäckning — every won-deal customer and where they stand on billing: set
 * up as a Fortnox customer, invoiced, recurring, on a contract. Answers "which
 * customers have a won deal (and are they being billed)". Gaps (not a Fortnox
 * customer, recurring without a contract) sort to the top.
 */
export const CustomerCoveragePage = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();

  const { data: coverage, isPending } = useQuery({
    queryKey: ["customer-coverage"],
    queryFn: () => dataProvider.getCustomerCoverage(),
  });

  const rows = useMemo(() => {
    // Gaps first: not-a-customer, then recurring-without-contract, then the
    // rest by won value.
    const gapScore = (c: CustomerCoverage) =>
      (c.is_fortnox_customer ? 0 : 2) +
      (c.has_recurring && !c.has_contract ? 1 : 0);
    return [...(coverage ?? [])].sort(
      (a, b) => gapScore(b) - gapScore(a) || b.won_amount - a.won_amount,
    );
  }, [coverage]);

  const summary = useMemo(() => {
    const list = coverage ?? [];
    return {
      customers: list.length,
      notInFortnox: list.filter((c) => !c.is_fortnox_customer).length,
      recurringNoContract: list.filter(
        (c) => c.has_recurring && !c.has_contract,
      ).length,
      mrr: list.reduce((sum, c) => sum + c.recurring_monthly, 0),
    };
  }, [coverage]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Kundtäckning</h1>
        <p className="text-sm text-muted-foreground">
          Alla kunder med en vunnen deal — och var de står i faktureringen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Vunna kunder" value={String(summary.customers)} />
        <StatCard
          label="Ej upplagda i Fortnox"
          value={String(summary.notInFortnox)}
        />
        <StatCard
          label="Återkommande utan avtal"
          value={String(summary.recurringNoContract)}
        />
        <StatCard
          label="MRR totalt"
          value={`${formatCurrency(summary.mrr)}/mån`}
        />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {isPending ? (
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
                  <TableHead className="text-right">Värde</TableHead>
                  <TableHead className="text-right">Återk./mån</TableHead>
                  <TableHead className="text-center">Fortnox-kund</TableHead>
                  <TableHead className="text-center">Faktura</TableHead>
                  <TableHead className="text-center">Avtal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.company_id}>
                    <TableCell className="font-medium">
                      {c.company_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.won_deal_count}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(c.won_amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.has_recurring
                        ? formatCurrency(c.recurring_monthly)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {c.is_fortnox_customer ? <Yes /> : <No />}
                    </TableCell>
                    <TableCell>{c.has_invoice ? <Yes /> : <No />}</TableCell>
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        "Faktura" visar om företaget har en matchad faktura i Fortnox (matchning
        sker på org.nr — saknas kopplingen kan en faktura ändå finnas). "Avtal"
        gäller bara kunder med återkommande belopp.
      </p>
    </div>
  );
};

CustomerCoveragePage.path = "/customer-coverage";
