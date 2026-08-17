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
 * A deal split into installments is billed one part at a time: the button offers
 * the next part, and the amount comes from the deal total divided by the number
 * of parts (the last part absorbs any rounding remainder). Everything else is
 * invoiced in full, once. Both cases are guarded in the database, so a double
 * click can't bill the customer twice, and the button turns into a badge once
 * there is nothing left to invoice.
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
    onSuccess: ({ document_number, installment_index, installment_count }) => {
      setConfirming(false);
      notify(
        installment_index
          ? `Delfaktura ${installment_index}/${installment_count} skapad i Fortnox (nr ${document_number}) som utkast — inget är bokfört eller skickat än.`
          : `Faktura ${document_number} skapad i Fortnox som utkast — inget är bokfört eller skickat än.`,
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

  const total = deal.amount ?? 0;
  if (deal.stage !== "won" || total <= 0) return null;

  const partCount = deal.installment_count ?? 0;
  const isInstallment =
    deal.billing_schedule_type === "installment" && partCount > 0;
  const invoicedParts = deal.installments_invoiced ?? 0;
  const partIndex = invoicedParts + 1;

  // The part amount, with the last part absorbing the rounding remainder —
  // mirrors installmentAmount in the edge function so the dialog promises the
  // figure that will actually be invoiced.
  const perPart = Math.round((total / (partCount || 1)) * 100) / 100;
  const partAmount =
    partIndex < partCount
      ? perPart
      : Math.round((total - perPart * (partCount - 1)) * 100) / 100;
  const amountToInvoice = isInstallment ? partAmount : total;

  const allPartsInvoiced = isInstallment && invoicedParts >= partCount;

  if (allPartsInvoiced) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline">
          {partCount} av {partCount} delfakturor skapade
        </Badge>
        <Button size="sm" variant="ghost" asChild>
          <a href="/#/invoices">
            <ExternalLink className="mr-2 h-3 w-3" />
            Fakturor
          </a>
        </Button>
      </div>
    );
  }

  if (!isInstallment && deal.fortnox_invoice_number) {
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
        title={
          isInstallment
            ? `Skapar ett fakturautkast i Fortnox på delbetalning ${partIndex} av ${partCount}`
            : "Skapar ett fakturautkast i Fortnox på affärens engångsbelopp"
        }
      >
        <FileText className="mr-2 h-4 w-4" />
        {isInstallment
          ? `Skapa delfaktura ${partIndex}/${partCount}`
          : "Skapa faktura i Fortnox"}
      </Button>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isInstallment
                ? `Fakturera del ${partIndex} av ${partCount} — ${formatCurrency(amountToInvoice)}?`
                : `Fakturera ${formatCurrency(amountToInvoice)}?`}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  En faktura på {formatCurrency(amountToInvoice)} ex moms skapas
                  i Fortnox för <strong>{deal.name}</strong>
                  {isInstallment
                    ? `, märkt som delbetalning ${partIndex}/${partCount} av totalt ${formatCurrency(total)}`
                    : ""}
                  . Saknas kunden i Fortnox läggs den upp automatiskt.
                </p>
                <p>
                  Fakturan blir ett <strong>utkast</strong> — den bokförs inte
                  och skickas inte till kunden förrän du gör det i Fortnox.
                </p>
                {isInstallment && partIndex < partCount ? (
                  <p className="text-muted-foreground">
                    Efter den här delen återstår {partCount - partIndex} av{" "}
                    {partCount}.
                  </p>
                ) : null}
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
              {isPending
                ? "Skapar…"
                : isInstallment
                  ? "Skapa delfaktura"
                  : "Skapa faktura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
