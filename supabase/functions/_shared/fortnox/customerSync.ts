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
import { FortnoxError } from "./errors.ts";
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

export type ManualLinkResult = {
  customer_number: string;
  action: "linked";
  relinked_invoices: number;
  customer_name: string | null;
  org_number: string | null;
};

type FortnoxSingleCustomerResponse = {
  Customer?: {
    CustomerNumber?: string;
    Name?: string;
    OrganisationNumber?: string;
  };
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

/**
 * Finds or creates this company as a customer in Fortnox.
 *
 * `environment` decides whether the stored link may be used at all.
 * `companies.fortnox_customer_number` identifies the customer in the *production*
 * company, so against a sandbox it is meaningless: reusing it would address a
 * stranger's customer number or, more often, one that doesn't exist there. And
 * writing a sandbox number back would overwrite the production link and break
 * invoice matching for a real customer. So a sandbox run resolves the customer
 * by organisation number every time and never persists what it finds.
 */
export async function ensureFortnoxCustomer(
  supabase: SupabaseClient,
  client: FortnoxClient,
  company: CrmCompany,
  options: { environment?: "production" | "sandbox" } = {},
): Promise<EnsureCustomerResult> {
  const payload: FortnoxCustomerPayload = mapCompanyToFortnoxCustomer(company);
  const isSandbox = options.environment === "sandbox";

  if (!isSandbox && company.fortnox_customer_number) {
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
    if (!isSandbox) await linkCompany(supabase, company.id, existing);
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

  if (!isSandbox) await linkCompany(supabase, company.id, customerNumber);
  return { customer_number: customerNumber, action: "created" };
}

/**
 * Links a company to an EXISTING Fortnox customer number entered by hand.
 *
 * For the customers the org-number path can't reach: Z-bud's fraktsedel
 * invoices sit on a Fortnox customer whose org number doesn't match the CRM
 * company, so `ensureFortnoxCustomer` would create a duplicate rather than
 * adopt it. Here the human supplies the exact number instead.
 *
 * Verifies the number is real (a typo would link nothing and quietly break the
 * next sync's dedup), writes it to the company, then relinks every mirrored
 * invoice already under that number so "betalt"/"kvar" is correct immediately
 * instead of waiting for the next full sync.
 */
export async function linkFortnoxCustomerByNumber(
  supabase: SupabaseClient,
  client: FortnoxClient,
  company: CrmCompany,
  customerNumber: string,
): Promise<ManualLinkResult> {
  const trimmed = customerNumber.trim();
  if (!trimmed) throw new HttpError(400, "Kundnummer saknas");

  // Confirm the number exists before writing it.
  let customer: FortnoxSingleCustomerResponse["Customer"];
  try {
    const response = await client.get<FortnoxSingleCustomerResponse>(
      `/3/customers/${encodeURIComponent(trimmed)}`,
    );
    customer = response.Customer;
  } catch (error) {
    if (error instanceof FortnoxError && error.status === 404) {
      throw new HttpError(404, `Kundnr ${trimmed} finns inte i Fortnox`, {
        code: "fortnox_customer_not_found",
      });
    }
    throw error;
  }

  const resolvedNumber = customer?.CustomerNumber;
  if (!resolvedNumber) {
    throw new HttpError(404, `Kundnr ${trimmed} finns inte i Fortnox`, {
      code: "fortnox_customer_not_found",
    });
  }

  // A clear message beats the unique-index constraint error.
  const { data: clash } = await supabase
    .from("companies")
    .select("id, name")
    .eq("fortnox_customer_number", resolvedNumber)
    .neq("id", company.id)
    .maybeSingle();
  if (clash) {
    throw new HttpError(
      409,
      `Kundnr ${resolvedNumber} är redan kopplat till ${
        (clash as { name?: string }).name ?? "ett annat företag"
      }`,
      { code: "fortnox_customer_number_taken" },
    );
  }

  const { error: updateError } = await supabase
    .from("companies")
    .update({ fortnox_customer_number: resolvedNumber })
    .eq("id", company.id);
  if (updateError) {
    throw new HttpError(500, "Kunde inte spara kundnumret i CRM:et", {
      code: "fortnox_link_write_failed",
    });
  }

  // Relink the mirror now so paid/remaining are correct immediately.
  const { data: relinked, error: relinkError } = await supabase
    .from("fortnox_invoices")
    .update({ company_id: company.id })
    .eq("customer_number", resolvedNumber)
    .select("document_number");
  if (relinkError) {
    console.warn("linkFortnoxCustomerByNumber: relink failed", {
      message: relinkError.message,
    });
  }

  return {
    customer_number: resolvedNumber,
    action: "linked",
    relinked_invoices: relinked?.length ?? 0,
    customer_name: customer?.Name ?? null,
    org_number: customer?.OrganisationNumber ?? null,
  };
}
