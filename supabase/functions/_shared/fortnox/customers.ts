/**
 * Mapping between CRM companies and Fortnox customers.
 *
 * Fortnox only requires `Name`, but an invoice needs a payable customer: an
 * address, an invoice email, VAT handling. We send what we have and let Fortnox
 * own the rest — it is the system the accountant actually works in.
 */

import { normalizeOrgNumber } from "./invoices.ts";

export type CrmCompany = {
  id: number;
  name: string;
  org_number?: string | null;
  address?: string | null;
  zipcode?: string | null;
  city?: string | null;
  country?: string | null;
  email?: string | null;
  billing_email?: string | null;
  website?: string | null;
  payment_terms?: string | null;
  vat_type?: string | null;
  fortnox_customer_number?: string | null;
};

export type FortnoxCustomerPayload = {
  Name: string;
  Type: "COMPANY";
  CountryCode: string;
  VATType: string;
  OrganisationNumber?: string;
  Address1?: string;
  ZipCode?: string;
  City?: string;
  Email?: string;
  EmailInvoice?: string;
  WWW?: string;
  TermsOfPayment?: string;
  ExternalReference: string;
};

export const DEFAULT_VAT_TYPE = "SEVAT";

export class MissingBillingDataError extends Error {
  readonly fields: string[];

  constructor(fields: string[]) {
    super(`Company is missing required billing data: ${fields.join(", ")}`);
    this.name = "MissingBillingDataError";
    this.fields = fields;
  }
}

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Fails loudly rather than creating a half-empty customer in Fortnox. A
 * customer without an org number or an invoice address is one an accountant has
 * to fix by hand later, which defeats the point of the integration.
 */
export function mapCompanyToFortnoxCustomer(
  company: CrmCompany,
): FortnoxCustomerPayload {
  const missing: string[] = [];

  const name = clean(company.name);
  if (!name) missing.push("name");

  const orgNumber = normalizeOrgNumber(company.org_number ?? null);
  if (!orgNumber) missing.push("org_number");

  const invoiceEmail = clean(company.billing_email) ?? clean(company.email);
  if (!invoiceEmail) missing.push("billing_email");

  if (missing.length > 0) throw new MissingBillingDataError(missing);

  return {
    Name: name!,
    Type: "COMPANY",
    CountryCode: "SE",
    VATType: clean(company.vat_type) ?? DEFAULT_VAT_TYPE,
    OrganisationNumber: orgNumber!,
    Address1: clean(company.address),
    ZipCode: clean(company.zipcode),
    City: clean(company.city),
    Email: invoiceEmail,
    EmailInvoice: invoiceEmail,
    WWW: clean(company.website),
    TermsOfPayment: clean(company.payment_terms),
    // Lets us find our way back from a Fortnox customer to the CRM row.
    ExternalReference: `crm-company-${company.id}`,
  };
}

export type QuoteLineItem = {
  description: string;
  quantity: number | null;
  unit_price: number | null;
  vat_rate?: number | null;
};

export type FortnoxInvoiceRowPayload = {
  Description: string;
  DeliveredQuantity: string;
  Price: number;
  VAT: number;
  AccountNumber?: number;
  ArticleNumber?: string;
};

/**
 * A free-text invoice row needs an account number, otherwise Fortnox rejects it
 * (or books it somewhere surprising). We pass the sales account explicitly
 * rather than relying on whatever default the tenant happens to have.
 *
 * 3001 ("Försäljning inom Sverige, momspliktig 25%") — confirmed against this
 * tenant's actual chart of accounts (every real invoice row already mirrored
 * from Fortnox uses 3001; 3011 doesn't exist here and was never live-verified).
 */
export const DEFAULT_SALES_ACCOUNT = 3001;
export const DEFAULT_VAT_RATE = 25;

export function mapQuoteLineItems(
  lineItems: QuoteLineItem[],
  options: { defaultVatRate?: number | null; salesAccount?: number } = {},
): FortnoxInvoiceRowPayload[] {
  if (lineItems.length === 0) {
    throw new Error("Cannot invoice a quote with no line items");
  }

  const fallbackVat = options.defaultVatRate ?? DEFAULT_VAT_RATE;
  const account = options.salesAccount ?? DEFAULT_SALES_ACCOUNT;

  return lineItems.map((item) => ({
    Description: item.description?.trim() || "Tjänst",
    DeliveredQuantity: String(item.quantity ?? 1),
    Price: item.unit_price ?? 0,
    VAT: Math.round(item.vat_rate ?? fallbackVat),
    AccountNumber: account,
  }));
}
