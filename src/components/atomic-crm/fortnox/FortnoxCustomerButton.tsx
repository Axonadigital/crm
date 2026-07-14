import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Check } from "lucide-react";
import {
  useDataProvider,
  useNotify,
  useRecordContext,
  useRefresh,
} from "ra-core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { CrmDataProvider } from "../providers/types";
import type { Company } from "../types";

/**
 * Pushes the company to Fortnox as a customer. Safe to click twice: the backend
 * matches on organisation number, so an existing Fortnox customer is adopted
 * rather than duplicated.
 */
export const FortnoxCustomerButton = () => {
  const company = useRecordContext<
    Company & { fortnox_customer_number?: string }
  >();
  const dataProvider = useDataProvider<CrmDataProvider>();
  const notify = useNotify();
  const refresh = useRefresh();
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => dataProvider.syncCompanyToFortnox(company!.id),
    onSuccess: ({ customer_number, action }) => {
      const what =
        action === "created"
          ? "skapades i Fortnox"
          : action === "linked"
            ? "fanns redan i Fortnox och kopplades"
            : "uppdaterades i Fortnox";
      notify(`Kunden ${what} (kundnr ${customer_number})`, { type: "info" });
      queryClient.invalidateQueries({ queryKey: ["fortnox"] });
      refresh();
    },
    // The backend explains exactly what is missing (e.g. org_number), so show
    // that rather than a generic failure.
    onError: (error: Error) =>
      notify(error.message || "Kunde inte skapa kunden i Fortnox", {
        type: "error",
      }),
  });

  if (!company) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => mutate()}
        disabled={isPending}
      >
        <Building2 className="mr-2 h-4 w-4" />
        {company.fortnox_customer_number
          ? "Uppdatera i Fortnox"
          : "Skapa i Fortnox"}
      </Button>
      {company.fortnox_customer_number ? (
        <Badge variant="outline" className="gap-1">
          <Check className="h-3 w-3" />
          Fortnox {company.fortnox_customer_number}
        </Badge>
      ) : null}
    </div>
  );
};
