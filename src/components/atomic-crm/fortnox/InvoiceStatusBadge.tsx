import { Badge } from "@/components/ui/badge";

import type { FortnoxInvoice } from "../types";
import { daysOverdue, isUnsentAndActionable } from "./invoiceFormat";

/**
 * The one place invoice status is rendered. Used on the Fakturor page and on
 * the customer card, so the two can never tell different stories.
 *
 * The send badge says "via Fortnox" on purpose. Fortnox's `Sent` flag only
 * knows about its own sender — an invoice emailed by hand looks unsent forever,
 * which is why 5 of the 7 "unsent" invoices in the tenant were already paid.
 * It is shown only where it is actionable: on an unpaid invoice.
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

      {showSent && isUnsentAndActionable(invoice) ? (
        <Badge variant="outline">Ej skickad via Fortnox</Badge>
      ) : null}
    </div>
  );
};
