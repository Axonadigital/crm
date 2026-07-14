import { AlertTriangle, Receipt, Send } from "lucide-react";
import type { Identifier } from "ra-core";

import { formatCurrency } from "./invoiceFormat";
import { useCompanyInvoices } from "./useCompanyInvoices";

/**
 * Invoice status at a glance on the customer card. Deliberately answers only
 * the questions worth interrupting someone for: does this customer owe us
 * money, is any of it late, and did we forget to send something.
 *
 * The full list lives on the Fakturor tab.
 */
export const CompanyInvoiceSummary = ({
  companyId,
}: {
  companyId: Identifier | undefined;
}) => {
  const { active, unpaidAmount, overdueAmount, overdueCount, unsentCount } =
    useCompanyInvoices(companyId);

  if (active.length === 0) return null;

  return (
    <div className="space-y-2 text-sm">
      <h3 className="flex items-center gap-2 font-semibold">
        <Receipt className="h-4 w-4" />
        Fakturor
      </h3>

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Obetalt</span>
        <span className={unpaidAmount > 0 ? "font-medium" : ""}>
          {formatCurrency(unpaidAmount)}
        </span>
      </div>

      {overdueCount > 0 ? (
        <div className="flex items-center justify-between text-destructive">
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Förfallet ({overdueCount})
          </span>
          <span className="font-medium">{formatCurrency(overdueAmount)}</span>
        </div>
      ) : null}

      {unsentCount > 0 ? (
        <div className="flex items-center gap-1 text-amber-700 dark:text-amber-500">
          <Send className="h-3 w-3" />
          {unsentCount} obetald{unsentCount > 1 ? "a" : ""} har inte gått ut via
          Fortnox
        </div>
      ) : null}
    </div>
  );
};
