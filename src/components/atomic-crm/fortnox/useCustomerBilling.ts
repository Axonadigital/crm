import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";
import type { Identifier } from "ra-core";

import type { CrmDataProvider } from "../providers/types";
import type { CustomerBillingRow } from "../types";

/**
 * The whole recurring-billing overview, cached once and shared by the customer
 * coverage page, the company card and the dashboard widget so they never
 * disagree. `getCustomerBillingOverview` already aggregates per company.
 */
export const useCustomerBillingOverview = () => {
  const dataProvider = useDataProvider<CrmDataProvider>();
  return useQuery({
    queryKey: ["customer-billing-overview"],
    queryFn: () => dataProvider.getCustomerBillingOverview(),
  });
};

/** The billing row for a single company, or null when it has no recurring deal. */
export const useCompanyBilling = (
  companyId: Identifier | undefined,
): { row: CustomerBillingRow | null; isPending: boolean } => {
  const { data, isPending } = useCustomerBillingOverview();
  const row =
    companyId == null
      ? null
      : ((data ?? []).find((r) => String(r.company_id) === String(companyId)) ??
        null);
  return { row, isPending };
};
