import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, PlayCircle, RefreshCw } from "lucide-react";
import { useDataProvider, useNotify } from "ra-core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { formatCurrency } from "../fortnox/invoiceFormat";
import type { CrmDataProvider } from "../providers/types";

const CADENCE: Record<string, string> = {
  monthly: "per månad",
  quarterly: "per kvartal",
  yearly: "per år",
};

type Result = {
  recurringId: string;
  status: string;
  handling: string;
  nextInvoiceDate?: string | null;
  activated: boolean;
};

/**
 * Runs the recurring-invoicing flow against the Fortnox test company, so it can
 * be tried on a real deal's figures before anyone points it at a paying
 * customer.
 *
 * It lives here rather than on the deal page for two reasons: the deal page
 * should only ever act on production, and a sandbox run is deliberately not
 * recorded on the deal — the test company's ids would otherwise mark a real
 * deal as already set up and block the genuine one. That is also why the
 * activation step passes the id back explicitly instead of reading it off the
 * deal.
 */
export const FortnoxRecurringSandboxTest = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const [dealId, setDealId] = useState<string>("");
  const [result, setResult] = useState<Result | null>(null);

  const { data: deals, isPending } = useQuery({
    queryKey: ["fortnox", "sandbox-test-deals"],
    queryFn: () => dataProvider.getRecurringRevenue(),
  });

  const recurringDeals = (deals ?? []).filter(
    (deal) => (deal.recurring_amount ?? 0) > 0,
  );
  const selected = recurringDeals.find((d) => String(d.id) === dealId);

  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: () =>
      dataProvider.createFortnoxRecurringFromDeal(dealId, "sandbox"),
    onSuccess: ({ recurring_id, status, invoice_handling, warning }) => {
      setResult({
        recurringId: recurring_id,
        status,
        handling: invoice_handling,
        activated: false,
      });
      notify(
        warning ??
          `Avtal upplagt i testmiljön och pausat (${status}). Inget faktureras.`,
        { type: warning ? "warning" : "info" },
      );
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte skapa avtalet i testmiljön", {
        type: "error",
      }),
  });

  const { mutate: activate, isPending: isActivating } = useMutation({
    mutationFn: () =>
      dataProvider.activateFortnoxRecurring(
        dealId,
        "sandbox",
        result?.recurringId,
      ),
    onSuccess: ({ status, invoice_handling, next_invoice_date }) => {
      setResult((current) =>
        current
          ? {
              ...current,
              status,
              handling: invoice_handling,
              nextInvoiceDate: next_invoice_date,
              activated: true,
            }
          : current,
      );
      notify(
        next_invoice_date
          ? `Aktiverat i testmiljön. Nästa faktura hade genererats ${next_invoice_date}.`
          : "Aktiverat i testmiljön.",
        { type: "info" },
      );
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte aktivera i testmiljön", {
        type: "error",
      }),
  });

  if (isPending) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div>
        <h4 className="text-sm font-medium">Testkör avtalsflödet</h4>
        <p className="text-xs text-muted-foreground">
          Kör samma två steg som på deal-sidan, fast mot testföretaget. Affären
          i CRM:et påverkas inte — inget sparas på den.
        </p>
      </div>

      <select
        className="w-full rounded-md border bg-background p-2 text-sm"
        value={dealId}
        onChange={(event) => {
          setDealId(event.target.value);
          setResult(null);
        }}
      >
        <option value="">Välj en vunnen affär med återkommande belopp…</option>
        {recurringDeals.map((deal) => (
          <option key={String(deal.id)} value={String(deal.id)}>
            {deal.company_name ?? "—"} · {deal.name} ·{" "}
            {formatCurrency(deal.recurring_amount ?? 0)}{" "}
            {CADENCE[deal.recurring_interval ?? "monthly"]}
          </option>
        ))}
      </select>

      {selected ? (
        <p className="text-xs text-muted-foreground">
          Startdatum:{" "}
          {selected.billing_start_date ?? "saknas — dagens datum används"}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!dealId || isCreating || Boolean(result)}
          onClick={() => create()}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isCreating ? "animate-spin" : ""}`}
          />
          1. Skapa pausat avtal
        </Button>
        <Button
          size="sm"
          disabled={!result || result.activated || isActivating}
          onClick={() => activate()}
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          2. Aktivera
        </Button>
        {result ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setResult(null)}
            disabled={isCreating || isActivating}
          >
            Börja om
          </Button>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            {result.activated
              ? "Aktiverat i testmiljön"
              : "Pausat i testmiljön — inget faktureras"}
          </div>
          <div>
            Status: <strong>{result.status}</strong> · hantering:{" "}
            <strong>{result.handling}</strong>
          </div>
          {result.nextInvoiceDate ? (
            <div>
              Nästa faktura hade genererats:{" "}
              <strong>{result.nextInvoiceDate}</strong>
            </div>
          ) : null}
          <div className="font-mono text-muted-foreground">
            {result.recurringId}
          </div>
        </div>
      ) : null}
    </div>
  );
};
