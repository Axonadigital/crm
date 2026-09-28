import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";
import type { Identifier } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { FortnoxInvoice } from "../types";
import { isUnsentAndActionable } from "./invoiceFormat";

export type CompanyInvoiceSummary = {
  invoices: FortnoxInvoice[];
  /** Excludes cancelled invoices — they are noise on a customer card. */
  active: FortnoxInvoice[];
  unpaidAmount: number;
  overdueAmount: number;
  overdueCount: number;
  unsentCount: number;
  isPending: boolean;
};

/**
 * Invoices for one company, straight from the mirror. Same source as the
 * Fakturor page, so a customer card can never disagree with it.
 */
export const useCompanyInvoices = (
  companyId: Identifier | undefined,
): CompanyInvoiceSummary => {
  const dataProvider = useDataProvider<CrmDataProvider>();

  const { data, isPending } = useQuery({
    queryKey: ["fortnox", "invoices", "company", companyId],
    queryFn: () => dataProvider.getFortnoxInvoicesByCompany(Number(companyId)),
    enabled: companyId !== undefined && companyId !== null,
  });

  const invoices = data ?? [];
  const active = invoices.filter((invoice) => invoice.status !== "cancelled");

  const sumBalance = (rows: FortnoxInvoice[]) =>
    rows.reduce((total, invoice) => total + Number(invoice.balance ?? 0), 0);

  const overdue = active.filter((invoice) => invoice.status === "overdue");

  return {
    invoices,
    active,
    unpaidAmount: sumBalance(
      active.filter((invoice) => invoice.status !== "paid"),
    ),
    overdueAmount: sumBalance(overdue),
    overdueCount: overdue.length,
    // Only unpaid invoices count: Fortnox's Sent flag knows nothing about
    // invoices we emailed by hand, so on a paid invoice it means nothing.
    unsentCount: active.filter(isUnsentAndActionable).length,
    isPending,
  };
};
