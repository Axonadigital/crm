import { CalendarClock } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { NextInvoiceChip } from "../fortnox/billingDisplay";
import { formatCurrency } from "../fortnox/invoiceFormat";
import { useCustomerBillingOverview } from "../fortnox/useCustomerBilling";
import { DashboardCard } from "./DashboardCard";

/**
 * The recurring invoices that need sending soon or are already past due —
 * derived from each customer's schedule (manual "invoiced through" when set,
 * otherwise the last Fortnox invoice rolled forward). Answers "when is the next
 * payment due" straight on the dashboard.
 */
export const UpcomingInvoices = () => {
  const { data } = useCustomerBillingOverview();

  const rows = (data ?? [])
    .filter(
      (row) =>
        row.next_invoice_date != null &&
        (row.billing_status === "overdue" || row.billing_status === "due_soon"),
    )
    .sort((a, b) =>
      String(a.next_invoice_date).localeCompare(String(b.next_invoice_date)),
    );

  const overdueCount = rows.filter(
    (row) => row.billing_status === "overdue",
  ).length;

  return (
    <DashboardCard
      title="Kommande fakturor"
      icon={CalendarClock}
      contentClassName="p-3"
    >
      {rows.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">
          Inga fakturor att skicka den närmaste månaden. 🎉
        </p>
      ) : (
        <div>
          <div className="flex items-center justify-between px-1 py-2 text-sm">
            <span className="font-medium">Att fakturera snart</span>
            {overdueCount > 0 ? (
              <Badge variant="destructive">{overdueCount} förfallna</Badge>
            ) : (
              <Badge variant="secondary">{rows.length}</Badge>
            )}
          </div>
          <div className="divide-y">
            {rows.slice(0, 6).map((row) => (
              <a
                key={row.company_id}
                href={`/#/companies/${row.company_id}/show`}
                className="flex items-center justify-between gap-2 px-1 py-2 text-sm hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate">
                  {row.company_name ?? "—"}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {row.remaining_to_invoice_this_year > 0 ? (
                    <span className="text-muted-foreground">
                      {formatCurrency(row.remaining_to_invoice_this_year)}
                    </span>
                  ) : null}
                  <NextInvoiceChip
                    date={row.next_invoice_date}
                    status={row.billing_status}
                  />
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </DashboardCard>
  );
};
