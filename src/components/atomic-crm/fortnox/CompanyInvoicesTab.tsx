import { useRecordContext } from "ra-core";

import type { Company } from "../types";
import { CompanyInvoiceList } from "./CompanyInvoiceList";

/**
 * Every invoice this customer has in Fortnox, with its status. Mirrors the
 * Fakturor page, scoped to one company.
 */
export const CompanyInvoicesTab = () => {
  const company = useRecordContext<Company>();
  return <CompanyInvoiceList companyId={company?.id} />;
};
