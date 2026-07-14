/**
 * Links a Fortnox invoice to a CRM company.
 *
 * Fortnox's invoice list does NOT carry the organisation number — the field
 * exists in the schema but comes back empty. Verified against the live tenant:
 * 42 of 42 invoices had no org number, all 42 had a CustomerNumber.
 *
 * So the chain is:
 *   invoice.CustomerNumber -> Fortnox customer -> OrganisationNumber -> company
 *
 * Invoices we created ourselves short-circuit this: they carry the CRM ids in
 * ExternalInvoiceReference1/2.
 */

import { normalizeOrgNumber } from "./invoices.ts";

export type CompanyIndex = {
  /** normalised org number -> company id */
  byOrgNumber: Map<string, number>;
  /** Fortnox customer number -> company id (already linked companies) */
  byCustomerNumber: Map<string, number>;
};

/** Fortnox customer number -> normalised org number */
export type CustomerOrgIndex = Map<string, string>;

export function buildCustomerOrgIndex(
  customers: { CustomerNumber?: string; OrganisationNumber?: string }[],
): CustomerOrgIndex {
  const index: CustomerOrgIndex = new Map();

  for (const customer of customers) {
    const customerNumber = customer.CustomerNumber;
    const orgNumber = normalizeOrgNumber(customer.OrganisationNumber);
    // Private customers carry a personal number, which normalizeOrgNumber
    // rejects. That is the point: we must not match a person to a company.
    if (customerNumber && orgNumber) index.set(customerNumber, orgNumber);
  }

  return index;
}

export function resolveCompanyId(
  invoice: {
    customer_number: string | null;
    organisation_number: string | null;
  },
  companies: CompanyIndex,
  customerOrgNumbers: CustomerOrgIndex,
): number | null {
  // Already linked in the CRM: cheapest and most certain.
  if (invoice.customer_number) {
    const direct = companies.byCustomerNumber.get(invoice.customer_number);
    if (direct !== undefined) return direct;
  }

  // Org number straight off the invoice, if Fortnox ever starts sending it.
  const own = normalizeOrgNumber(invoice.organisation_number);
  if (own) {
    const match = companies.byOrgNumber.get(own);
    if (match !== undefined) return match;
  }

  // The real path: via the Fortnox customer record.
  if (invoice.customer_number) {
    const orgNumber = customerOrgNumbers.get(invoice.customer_number);
    if (orgNumber) {
      const match = companies.byOrgNumber.get(orgNumber);
      if (match !== undefined) return match;
    }
  }

  return null;
}
