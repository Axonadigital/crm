import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Receipt } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import type { Quote } from "../types";

type QuoteWithInvoice = Quote & { fortnox_invoice_number?: number | null };

/**
 * Creates an invoice in Fortnox from this quote.
 *
 * The invoice is created UNBOOKED and UNSENT — a draft. Sending it is a
 * separate, deliberate action on the Fakturor page. Nothing here touches the
 * accounting record.
 *
 * A quote can only be invoiced once; the database enforces it, and the button
 * turns into a link to the invoice afterwards.
 */
export const InvoiceQuoteButton = () => {
  const quote = useRecordContext<QuoteWithInvoice>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => dataProvider.createFortnoxInvoiceFromQuote(quote!.id),
    onSuccess: ({ document_number }) => {
      notify(
        `Fakturautkast ${document_number} skapat i Fortnox. Den är varken bokförd eller skickad.`,
        { type: "info" },
      );
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
      refresh();
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte skapa fakturan", { type: "error" }),
  });

  if (!quote) return null;

  if (quote.fortnox_invoice_number) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline">
          Fakturerad · {quote.fortnox_invoice_number}
        </Badge>
        <Button size="sm" variant="ghost" asChild>
          <a href="/#/invoices">
            <ExternalLink className="mr-2 h-3 w-3" />
            Visa faktura
          </a>
        </Button>
      </div>
    );
  }

  // Invoicing an unsigned quote is almost always a mistake, so make the user
  // sign it (or say so out loud) first.
  const canInvoice = quote.status === "signed";

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mutate()}
      disabled={isPending || !canInvoice}
      title={
        canInvoice
          ? "Skapar ett obokfört fakturautkast i Fortnox"
          : "Offerten måste vara signerad innan den kan faktureras"
      }
    >
      <Receipt className="mr-2 h-4 w-4" />
      Fakturera
    </Button>
  );
};
