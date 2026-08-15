import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { CrmDataProvider } from "../providers/types";
import type { Deal } from "../types";
import { formatCurrency } from "./invoiceFormat";

/**
 * Invoices a won deal's one-time amount in Fortnox, creating the customer there
 * first if it doesn't exist yet.
 *
 * The invoice is created unbooked and unsent — Fortnox holds it as a draft
 * until a human books and sends it. What this button really buys is the link:
 * the invoice carries the deal reference, so Kundtäckning stops having to guess
 * which invoice belongs to which deal from the amount alone.
 *
 * A deal can only be invoiced once; the database enforces it and the button
 * becomes a badge afterwards. Installment deals are excluded — they must be
 * billed one part at a time, which this flow doesn't do yet.
 */
export const InvoiceDealButton = () => {
  const deal = useRecordContext<Deal>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: () => dataProvider.createFortnoxInvoiceFromDeal(deal!.id),
    onSuccess: ({ document_number }) => {
      setConfirming(false);
      notify(
        `Faktura ${document_number} skapad i Fortnox som utkast — inget är bokfört eller skickat än.`,
        { type: "info" },
      );
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
      refresh();
    },
    onError: (error: Error) => {
      setConfirming(false);
      notify(error.message || "Kunde inte skapa fakturan", { type: "error" });
    },
  });

  if (!deal) return null;

  const amount = deal.amount ?? 0;
  const isInstallment = deal.billing_schedule_type === "installment";
  if (deal.stage !== "won" || amount <= 0 || isInstallment) return null;

  if (deal.fortnox_invoice_number) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline">Faktura · {deal.fortnox_invoice_number}</Badge>
        <Button size="sm" variant="ghost" asChild>
          <a href="/#/invoices">
            <ExternalLink className="mr-2 h-3 w-3" />
            Fakturor
          </a>
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setConfirming(true)}
        disabled={isPending}
        title="Skapar ett fakturautkast i Fortnox på affärens engångsbelopp"
      >
        <FileText className="mr-2 h-4 w-4" />
        Skapa faktura i Fortnox
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fakturera {formatCurrency(amount)}?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  En faktura på {formatCurrency(amount)} ex moms skapas i
                  Fortnox för <strong>{deal.name}</strong>. Saknas kunden i
                  Fortnox läggs den upp automatiskt.
                </p>
                <p>
                  Fakturan blir ett <strong>utkast</strong> — den bokförs inte
                  och skickas inte till kunden förrän du gör det i Fortnox.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={isPending}
            >
              Avbryt
            </Button>
            <Button onClick={() => mutate()} disabled={isPending}>
              {isPending ? "Skapar…" : "Skapa faktura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
