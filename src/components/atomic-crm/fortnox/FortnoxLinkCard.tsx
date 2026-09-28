import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useState } from "react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { CrmDataProvider } from "../providers/types";
import type { Company } from "../types";
import { formatCurrency } from "./invoiceFormat";

/**
 * Manual Fortnox linking for the customers the org-number match can't reach.
 *
 * Z-bud's fraktsedel invoices sit on a Fortnox customer with no matching org
 * number, so "Skapa i Fortnox" can't adopt it and "betalt" stays wrong. Here
 * the user pastes the exact customer number — or picks it straight from the
 * list of orphaned invoices — and the backend relinks the mirror on the spot.
 *
 * Only rendered while the company has no Fortnox link, so a linked customer
 * card stays clean.
 */
export const FortnoxLinkCard = () => {
  const company = useRecordContext<
    Company & { fortnox_customer_number?: string }
  >();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const { data: unlinked } = useQuery({
    queryKey: ["fortnox", "unlinked-invoices"],
    queryFn: () => dataProvider.getUnlinkedFortnoxInvoices(),
    // Only worth loading when the user is actually looking at an unlinked card.
    enabled: !!company && !company.fortnox_customer_number,
  });

  const { mutate, isPending } = useMutation({
    mutationFn: (customerNumber: string) =>
      dataProvider.linkFortnoxCustomer(company!.id, customerNumber),
    onSuccess: (result) => {
      notify(
        result.relinked_invoices > 0
          ? `Kopplat till Fortnox-kundnr ${result.customer_number} — ${result.relinked_invoices} faktura(or) matchade`
          : `Kopplat till Fortnox-kundnr ${result.customer_number}`,
        { type: "info" },
      );
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
      queryClient.invalidateQueries({
        queryKey: ["customer-billing-overview"],
      });
      setValue("");
      refresh();
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte koppla kundnumret", {
        type: "error",
      }),
  });

  if (!company || company.fortnox_customer_number) return null;

  const suggestions = unlinked ?? [];

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
      <h3 className="flex items-center gap-2 font-semibold">
        <Link2 className="h-4 w-4" />
        Koppla Fortnox-kund
      </h3>
      <p className="text-xs text-muted-foreground">
        Fakturor matchas på org.nr. Går det inte — klistra in kundnumret från
        Fortnox här, så kopplas betalningarna direkt.
      </p>

      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Kundnr, t.ex. 42"
          className="h-8"
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim() && !isPending) {
              mutate(value.trim());
            }
          }}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!value.trim() || isPending}
          onClick={() => mutate(value.trim())}
        >
          Koppla
        </Button>
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-1 pt-1">
          <p className="text-xs font-medium text-muted-foreground">
            Omatchade fakturor i Fortnox
          </p>
          {suggestions.slice(0, 5).map((s) => (
            <button
              key={s.customer_number}
              type="button"
              disabled={isPending}
              onClick={() => mutate(s.customer_number)}
              className="flex w-full items-center justify-between gap-2 rounded px-1 py-1 text-left hover:bg-muted/50 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="text-muted-foreground">
                  #{s.customer_number}
                </span>{" "}
                {s.customer_name ?? "—"}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {s.invoice_count} st · {formatCurrency(s.total_amount)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
