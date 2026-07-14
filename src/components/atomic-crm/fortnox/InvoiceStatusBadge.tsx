import { Badge } from "@/components/ui/badge";

import type { FortnoxInvoice } from "../types";
import { daysOverdue } from "./invoiceFormat";

/**
 * The one place invoice status is rendered. Used on the Fakturor page and on
 * the customer card, so the two can never tell different stories.
 *
 * "Ej skickad" is deliberately a separate badge, not a status: an invoice the
 * customer never received is still unpaid, and the two facts matter separately.
 */
export const InvoiceStatusBadge = ({
  invoice,
  showSent = true,
}: {
  invoice: Pick<FortnoxInvoice, "status" | "due_date" | "sent">;
  showSent?: boolean;
}) => {
  const overdue = daysOverdue(invoice.due_date);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {invoice.status === "overdue" ? (
        <Badge variant="destructive">
          Förfallen{overdue ? ` · ${overdue} d` : ""}
        </Badge>
      ) : invoice.status === "paid" ? (
        <Badge variant="outline" className="border-green-600 text-green-700">
          Betald
        </Badge>
      ) : invoice.status === "cancelled" ? (
        <Badge variant="secondary">Makulerad</Badge>
      ) : (
        <Badge variant="secondary">Obetald</Badge>
      )}

      {showSent && !invoice.sent && invoice.status !== "cancelled" ? (
        <Badge variant="outline">Ej skickad</Badge>
      ) : null}
    </div>
  );
};
