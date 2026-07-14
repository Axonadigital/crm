/**
 * Pulls Fortnox invoices into the `fortnox_invoices` mirror.
 *
 * Fortnox has no webhooks, so this is the only way payment status ever reaches
 * the CRM. Runs every 15 minutes from pg_cron, and can be triggered by an admin
 * from the UI ("Synka nu").
 *
 * Delta by default: `?lastmodified=` from the stored watermark. Pass
 * { full: true } for a backfill — the first run has no watermark and does this
 * automatically.
 *
 * Auth: x-cron-secret (pg_cron) or an admin CRM user. Never public.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { errorResponseFromUnknown, HttpError } from "../_shared/http.ts";
import { createFortnoxClient } from "../_shared/fortnox/index.ts";
import {
  formatLastModified,
  mapInvoice,
  normalizeOrgNumber,
  parseDealReference,
  parseQuoteReference,
} from "../_shared/fortnox/invoices.ts";
import {
  buildCustomerOrgIndex,
  type CompanyIndex,
  resolveCompanyId,
} from "../_shared/fortnox/linking.ts";

const RESOURCE = "invoices";
const PAGE_SIZE = 100;
// A guard, not a limit: 100 pages is 10 000 invoices. If we ever hit it,
// something is looping and we want to stop rather than hammer Fortnox.
const MAX_PAGES = 100;

type FortnoxInvoiceListResponse = {
  MetaInformation?: { "@TotalPages"?: number; "@CurrentPage"?: number };
  Invoices?: Record<string, unknown>[];
};

async function authorize(req: Request): Promise<void> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");

  if (cronSecret && providedSecret && providedSecret === cronSecret) return;

  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) throw new HttpError(401, "Missing authorization");

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Unauthorized");

  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("administrator")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!sale?.administrator) {
    throw new HttpError(403, "Administrator required");
  }
}

type FortnoxCustomerListResponse = {
  MetaInformation?: { "@TotalPages"?: number };
  Customers?: { CustomerNumber?: string; OrganisationNumber?: string }[];
};

/**
 * Fetches the Fortnox customer register. Needed because the invoice list does
 * NOT carry the organisation number — verified against the live tenant, where
 * 42 of 42 invoices had none and all 42 had a CustomerNumber. The customer
 * record is what carries the org number, and the org number is what links to
 * the CRM.
 */
async function fetchCustomers(
  client: ReturnType<typeof createFortnoxClient>,
): Promise<{ CustomerNumber?: string; OrganisationNumber?: string }[]> {
  const customers: { CustomerNumber?: string; OrganisationNumber?: string }[] =
    [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await client.get<FortnoxCustomerListResponse>(
      "/3/customers",
      { limit: 500, page },
    );
    totalPages = response.MetaInformation?.["@TotalPages"] ?? 1;
    customers.push(...(response.Customers ?? []));
    page++;
  } while (page <= totalPages && page <= 20);

  return customers;
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    const startedAt = new Date().toISOString();

    try {
      await authorize(req);

      const body = await req.json().catch(() => ({}));
      const forceFull = (body as { full?: boolean })?.full === true;

      const { data: state } = await supabaseAdmin
        .from("fortnox_sync_state")
        .select("last_synced_at")
        .eq("resource", RESOURCE)
        .maybeSingle();

      const watermark = forceFull ? null : (state?.last_synced_at ?? null);

      // Build the company lookups once. 47 customers today; even at 10x this is
      // one query rather than one per invoice.
      const { data: companies } = await supabaseAdmin
        .from("companies")
        .select("id, org_number, fortnox_customer_number");

      const byOrgNumber = new Map<string, number>();
      const byCustomerNumber = new Map<string, number>();
      for (const company of companies ?? []) {
        const org = normalizeOrgNumber(company.org_number);
        if (org && !byOrgNumber.has(org)) byOrgNumber.set(org, company.id);
        if (company.fortnox_customer_number) {
          byCustomerNumber.set(company.fortnox_customer_number, company.id);
        }
      }

      const client = createFortnoxClient();

      const customerOrgNumbers = buildCustomerOrgIndex(
        await fetchCustomers(client),
      );
      const companyIndex: CompanyIndex = { byOrgNumber, byCustomerNumber };

      // Fortnox customer numbers we resolved to a CRM company but that the CRM
      // did not know about yet. Written back below, so the link is permanent
      // and the "Skapa i Fortnox" button knows the customer already exists.
      const discoveredLinks = new Map<number, string>();

      const rows: Record<string, unknown>[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await client.get<FortnoxInvoiceListResponse>(
          "/3/invoices",
          {
            limit: PAGE_SIZE,
            page,
            ...(watermark
              ? { lastmodified: formatLastModified(watermark) }
              : {}),
          },
        );

        totalPages = response.MetaInformation?.["@TotalPages"] ?? 1;

        for (const raw of response.Invoices ?? []) {
          const row = mapInvoice(raw, startedAt);
          if (!row) continue;

          const companyId = resolveCompanyId(
            row,
            companyIndex,
            customerOrgNumbers,
          );

          if (
            companyId !== null &&
            row.customer_number &&
            !byCustomerNumber.has(row.customer_number)
          ) {
            discoveredLinks.set(companyId, row.customer_number);
          }

          rows.push({
            ...row,
            company_id: companyId,
            quote_id: parseQuoteReference(row.external_reference_1),
            deal_id: parseDealReference(row.external_reference_2),
          });
        }

        page++;
      } while (page <= totalPages && page <= MAX_PAGES);

      if (page > MAX_PAGES) {
        console.warn("fortnox_sync_invoices: stopped at the page cap", {
          totalPages,
        });
      }

      if (rows.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from("fortnox_invoices")
          .upsert(rows, { onConflict: "document_number" });

        if (upsertError) {
          throw new HttpError(500, "Failed to write invoice mirror", {
            code: "fortnox_mirror_write_failed",
            details: { message: upsertError.message },
          });
        }
      }

      // Record the customer links we discovered. Guarded by `is null` so a link
      // set by hand (or by fortnox_customers) is never overwritten.
      for (const [companyId, customerNumber] of discoveredLinks) {
        const { error: linkError } = await supabaseAdmin
          .from("companies")
          .update({ fortnox_customer_number: customerNumber })
          .eq("id", companyId)
          .is("fortnox_customer_number", null);

        if (linkError) {
          console.warn("fortnox_sync_invoices: could not link company", {
            companyId,
            message: linkError.message,
          });
        }
      }

      // The watermark only moves on success. A failed run must re-read the same
      // window rather than silently skip it.
      await supabaseAdmin.from("fortnox_sync_state").upsert(
        {
          resource: RESOURCE,
          last_synced_at: startedAt,
          last_run_at: new Date().toISOString(),
          last_error: null,
          rows_synced: rows.length,
        },
        { onConflict: "resource" },
      );

      return createJsonResponse({
        synced: rows.length,
        mode: watermark ? "delta" : "full",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("fortnox_sync_invoices failed:", message);

      await supabaseAdmin.from("fortnox_sync_state").upsert(
        {
          resource: RESOURCE,
          last_run_at: new Date().toISOString(),
          last_error: message.slice(0, 500),
        },
        { onConflict: "resource" },
      );

      return errorResponseFromUnknown(error);
    }
  }),
);
