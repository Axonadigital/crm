import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import type { Deal } from "../types";

type DealWithContract = Deal & { fortnox_contract_number?: number | null };

/**
 * Turns a won recurring deal into a Fortnox contract (avtal) — the recurring-
 * billing setup.
 *
 * Creating the contract does NOT book or send anything. Fortnox generates the
 * recurring invoices from it; a human still sends each one. A deal can only get
 * one contract; the database enforces it, and the button becomes a badge after.
 *
 * Only shown for won deals that actually carry a recurring amount.
 */
export const ContractDealButton = () => {
  const deal = useRecordContext<DealWithContract>();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => dataProvider.createFortnoxContractFromDeal(deal!.id),
    onSuccess: ({ document_number }) => {
      notify(
        `Avtal ${document_number} skapat i Fortnox. Fortnox genererar de löpande fakturorna — inget är bokfört eller skickat.`,
        { type: "info" },
      );
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
      refresh();
    },
    onError: (error: Error) =>
      notify(error.message || "Kunde inte skapa avtalet", { type: "error" }),
  });

  if (!deal) return null;

  // Only relevant for won deals with a recurring amount.
  const isRecurring = !!deal.recurring_amount && deal.recurring_amount > 0;
  if (!isRecurring || deal.stage !== "won") return null;

  if (deal.fortnox_contract_number) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline">Avtal · {deal.fortnox_contract_number}</Badge>
        <Button size="sm" variant="ghost" asChild>
          <a href="/#/liquidity">
            <ExternalLink className="mr-2 h-3 w-3" />
            Likviditet
          </a>
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => mutate()}
      disabled={isPending}
      title="Skapar ett löpande avtal i Fortnox som genererar återkommande fakturor"
    >
      <RefreshCw className="mr-2 h-4 w-4" />
      Skapa avtal i Fortnox
    </Button>
  );
};
