import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, PlayCircle, RefreshCw } from "lucide-react";
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

const INTERVAL_LABELS: Record<string, string> = {
  monthly: "per månad",
  quarterly: "per kvartal",
  yearly: "per år",
};

/**
 * Sets up "Återkommande fakturering" in Fortnox for a won recurring deal, in
 * two deliberate steps.
 *
 * Creating lands a DRAFT with manual handling — visible and checkable in
 * Fortnox, but it bills nobody. Activating is a separate button that switches
 * it to automatic, and that is the action that actually starts invoicing the
 * customer, so it confirms first and says so plainly.
 *
 * Fortnox has no "create a draft" API input (POST always persists ACTIVE), so
 * the draft state is produced by creating with manual handling and patching the
 * status down. Either way nothing can go out before activation.
 */
export const RecurringDealButton = () => {
  const deal = useRecordContext<Deal>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const queryClient = useQueryClient();
  const [confirmingActivate, setConfirmingActivate] = useState(false);

  const settled = () => {
    queryClient.invalidateQueries({ queryKey: ["fortnox"] });
    refresh();
  };

  const { mutate: create, isPending: isCreating } = useMutation({
    mutationFn: () => dataProvider.createFortnoxRecurringFromDeal(deal!.id),
    onSuccess: ({ status, warning }) => {
      notify(
        warning ??
          `Återkommande fakturering upplagd i Fortnox som ${status === "DRAFT" ? "utkast" : status} — inga fakturor skickas förrän du aktiverar den.`,
        { type: warning ? "warning" : "info" },
      );
      settled();
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte lägga upp återkommande fakturering", {
        type: "error",
      }),
  });

  const { mutate: activate, isPending: isActivating } = useMutation({
    mutationFn: () => dataProvider.activateFortnoxRecurring(deal!.id),
    onSuccess: ({ next_invoice_date }) => {
      setConfirmingActivate(false);
      notify(
        next_invoice_date
          ? `Återkommande fakturering aktiverad. Nästa faktura genereras ${next_invoice_date}.`
          : "Återkommande fakturering aktiverad. Fortnox genererar fakturorna enligt schemat.",
        { type: "info" },
      );
      settled();
    },
    onError: (error: Error) => {
      setConfirmingActivate(false);
      notify(error.message || "Kunde inte aktivera faktureringen", {
        type: "error",
      });
    },
  });

  if (!deal) return null;

  const amount = deal.recurring_amount ?? 0;
  if (deal.stage !== "won" || amount <= 0) return null;

  const cadence = INTERVAL_LABELS[deal.recurring_interval ?? "monthly"];
  const status = deal.fortnox_recurring_status;

  if (!deal.fortnox_recurring_id) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => create()}
        disabled={isCreating}
        title="Lägger upp återkommande fakturering i Fortnox som utkast — inga fakturor skickas"
      >
        <RefreshCw
          className={`mr-2 h-4 w-4 ${isCreating ? "animate-spin" : ""}`}
        />
        Lägg upp återkommande
      </Button>
    );
  }

  if (status === "ACTIVE") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary">
          Återkommande aktiv · {formatCurrency(amount)} {cadence}
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

  if (status === "INACTIVE" || status === "FINISHED") {
    return (
      <Badge variant="outline">
        Återkommande {status === "FINISHED" ? "avslutad" : "pausad"} i Fortnox
      </Badge>
    );
  }

  // DRAFT (or an unknown status we haven't refreshed): offer activation.
  return (
    <>
      <div className="flex items-center gap-2">
        <Badge variant="outline">Återkommande: utkast</Badge>
        <Button
          size="sm"
          onClick={() => setConfirmingActivate(true)}
          disabled={isActivating}
          title="Startar den återkommande faktureringen i Fortnox"
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          Aktivera
        </Button>
      </div>

      <Dialog open={confirmingActivate} onOpenChange={setConfirmingActivate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Aktivera återkommande fakturering på {formatCurrency(amount)}{" "}
              {cadence}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Fortnox börjar generera fakturor för{" "}
                  <strong>{deal.name}</strong> enligt schemat. Det här är steget
                  som faktiskt börjar fakturera kunden.
                </p>
                <p>
                  Kontrollera avtalet i Fortnox först om du inte redan gjort det
                  — belopp, startdatum och faktureringsintervall.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmingActivate(false)}
              disabled={isActivating}
            >
              Avbryt
            </Button>
            <Button onClick={() => activate()} disabled={isActivating}>
              {isActivating ? "Aktiverar…" : "Aktivera fakturering"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
