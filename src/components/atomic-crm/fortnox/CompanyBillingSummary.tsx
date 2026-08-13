import { Repeat } from "lucide-react";
import type { Identifier } from "ra-core";

import {
  BILLING_CADENCE_LABELS,
  BillingStatusBadge,
  NextInvoiceChip,
} from "./billingDisplay";
import { formatCurrency } from "./invoiceFormat";
import { useCompanyBilling } from "./useCustomerBilling";

/**
 * Recurring billing at a glance on the customer card — the primary place the
 * team asked to see "how much have they paid and when is the next invoice".
 * Only rendered for customers with a recurring deal.
 */
export const CompanyBillingSummary = ({
  companyId,
}: {
  companyId: Identifier | undefined;
}) => {
  const { row } = useCompanyBilling(companyId);

  if (!row) return null;

  const year = new Date().getFullYear();

  return (
    <div className="space-y-2 text-sm">
      <h3 className="flex items-center gap-2 font-semibold">
        <Repeat className="h-4 w-4" />
        Återkommande
      </h3>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">
          {BILLING_CADENCE_LABELS[row.billing_cadence]}
        </span>
        <span className="font-medium">
          {formatCurrency(row.monthly_recurring)}/mån
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Nästa faktura</span>
        {row.next_invoice_date ? (
          <NextInvoiceChip
            date={row.next_invoice_date}
            status={row.billing_status}
          />
        ) : (
          <BillingStatusBadge status={row.billing_status} />
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Betalt {year}</span>
        <span>{formatCurrency(row.paid_year_to_date)}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Kvar att fakturera</span>
        <span
          className={
            row.remaining_to_invoice_this_year > 0 ? "font-medium" : ""
          }
        >
          {formatCurrency(row.remaining_to_invoice_this_year)}
        </span>
      </div>

      {!row.has_manual_schedule && row.paid_year_to_date === 0 ? (
        <p className="text-xs text-muted-foreground">
          Ingen matchad Fortnox-faktura. Sätt "Fakturerad t.o.m." på dealen för
          exakt nästa datum.
        </p>
      ) : null}
    </div>
  );
};
