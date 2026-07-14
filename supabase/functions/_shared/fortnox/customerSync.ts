/**
 * Ensures a CRM company exists as a customer in Fortnox and that the link is
 * recorded. Shared by the manual "Skapa i Fortnox" button and by invoicing,
 * which needs a customer before it can create an invoice.
 *
 * Order matters: look up by org number BEFORE creating. Duplicate customers in
 * an accounting system are painful to untangle, and Fortnox will happily create
 * a second one with the same org number.
 */
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { HttpError } from "../http.ts";
import type { FortnoxClient } from "./client.ts";
import {
  type CrmCompany,
  type FortnoxCustomerPayload,
  mapCompanyToFortnoxCustomer,
} from "./customers.ts";
import { normalizeOrgNumber } from "./invoices.ts";

export type EnsureCustomerResult = {
  customer_number: string;
  action: "created" | "linked" | "updated";
};

type FortnoxCustomerResponse = {
  Customer?: { CustomerNumber?: string; Name?: string };
};

type FortnoxCustomerListResponse = {
  Customers?: { CustomerNumber?: string; OrganisationNumber?: string }[];
};

const COMPANY_COLUMNS =
  "id, name, org_number, address, zipcode, city, email, billing_email, website, payment_terms, vat_type, fortnox_customer_number";

export async function loadCompany(
  supabase: SupabaseClient,
  companyId: number,
): Promise<CrmCompany> {
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_COLUMNS)
    .eq("id", companyId)
    .maybeSingle();

  if (error || !data) throw new HttpError(404, "Company not found");
  return data as CrmCompany;
}

async function findByOrgNumber(
  client: FortnoxClient,
  orgNumber: string,
): Promise<string | null> {
  const result = await client.get<FortnoxCustomerListResponse>("/3/customers", {
    organisationnumber: orgNumber,
    limit: 5,
  });

  for (const candidate of result.Customers ?? []) {
    if (normalizeOrgNumber(candidate.OrganisationNumber) === orgNumber) {
      return candidate.CustomerNumber ?? null;
    }
  }

  return null;
}

async function linkCompany(
  supabase: SupabaseClient,
  companyId: number,
  customerNumber: string,
): Promise<void> {
  const { error } = await supabase
    .from("companies")
    .update({ fortnox_customer_number: customerNumber })
    .eq("id", companyId);

  if (error) {
    // The customer now exists in Fortnox but the CRM does not know about it.
    // Failing loudly is the only safe move: retrying blind would create a
    // duplicate customer.
    throw new HttpError(
      500,
      `Kund ${customerNumber} skapades i Fortnox men kunde inte kopplas i CRM:et. Koppla den manuellt innan du försöker igen.`,
      { code: "fortnox_link_write_failed" },
    );
  }
}

export async function ensureFortnoxCustomer(
  supabase: SupabaseClient,
  client: FortnoxClient,
  company: CrmCompany,
): Promise<EnsureCustomerResult> {
  const payload: FortnoxCustomerPayload = mapCompanyToFortnoxCustomer(company);

  if (company.fortnox_customer_number) {
    await client.put(`/3/customers/${company.fortnox_customer_number}`, {
      Customer: payload,
    });
    return {
      customer_number: company.fortnox_customer_number,
      action: "updated",
    };
  }

  const existing = await findByOrgNumber(client, payload.OrganisationNumber!);

  if (existing) {
    await client.put(`/3/customers/${existing}`, { Customer: payload });
    await linkCompany(supabase, company.id, existing);
    return { customer_number: existing, action: "linked" };
  }

  const created = await client.post<FortnoxCustomerResponse>("/3/customers", {
    Customer: payload,
  });

  const customerNumber = created.Customer?.CustomerNumber;
  if (!customerNumber) {
    throw new HttpError(502, "Fortnox returned no customer number", {
      code: "fortnox_no_customer_number",
    });
  }

  await linkCompany(supabase, company.id, customerNumber);
  return { customer_number: customerNumber, action: "created" };
}
