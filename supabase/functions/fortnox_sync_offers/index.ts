/**
 * Pulls Fortnox offers into the `fortnox_offers` mirror.
 *
 * Critically, this must NOT touch the signing columns. Fortnox knows nothing
 * about signatures — if the sync upserted whole rows it would wipe the signing
 * state on every run, 15 minutes after every send.
 *
 * Auth: x-cron-secret (pg_cron) or an admin CRM user.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { errorResponseFromUnknown, HttpError } from "../_shared/http.ts";
import { createFortnoxClient } from "../_shared/fortnox/index.ts";
import {
  formatLastModified,
  normalizeOrgNumber,
  parseDealReference,
} from "../_shared/fortnox/invoices.ts";
import {
  buildCustomerOrgIndex,
  type CompanyIndex,
  resolveCompanyId,
} from "../_shared/fortnox/linking.ts";
import { mapOffer } from "../_shared/fortnox/offers.ts";

const RESOURCE = "offers";
const PAGE_SIZE = 100;
const MAX_PAGES = 50;

type FortnoxOfferListResponse = {
  MetaInformation?: { "@TotalPages"?: number };
  Offers?: Record<string, unknown>[];
};

type FortnoxCustomerListResponse = {
  MetaInformation?: { "@TotalPages"?: number };
  Customers?: { CustomerNumber?: string; OrganisationNumber?: string }[];
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

  if (!sale?.administrator) throw new HttpError(403, "Administrator required");
}

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

      const rows: Record<string, unknown>[] = [];
      // Links we could resolve. Applied separately, below.
      const resolvedLinks: {
        documentNumber: number;
        companyId: number | null;
        dealId: number | null;
      }[] = [];

      let page = 1;
      let totalPages = 1;

      do {
        const response = await client.get<FortnoxOfferListResponse>(
          "/3/offers",
          {
            limit: PAGE_SIZE,
            page,
            ...(watermark
              ? { lastmodified: formatLastModified(watermark) }
              : {}),
          },
        );

        totalPages = response.MetaInformation?.["@TotalPages"] ?? 1;

        for (const raw of response.Offers ?? []) {
          const row = mapOffer(raw, startedAt);
          if (!row) continue;

          rows.push(row);

          resolvedLinks.push({
            documentNumber: row.document_number,
            // Offers carry no OrganisationNumber either, so the link goes
            // through the customer register, same as invoices.
            companyId: resolveCompanyId(
              {
                customer_number: row.customer_number,
                organisation_number: null,
              },
              companyIndex,
              customerOrgNumbers,
            ),
            dealId: parseDealReference(row.external_reference_2),
          });
        }

        page++;
      } while (page <= totalPages && page <= MAX_PAGES);

      if (rows.length > 0) {
        // Only Fortnox-owned columns are in this payload. PostgREST updates
        // exactly the keys we send, so signing_status, docuseal_* and
        // fortnox_invoice_number survive — Fortnox knows nothing about them and
        // must never be allowed to erase them.
        const { error: upsertError } = await supabaseAdmin
          .from("fortnox_offers")
          .upsert(rows, { onConflict: "document_number" });

        if (upsertError) {
          throw new HttpError(500, "Failed to write offer mirror", {
            code: "fortnox_offer_mirror_write_failed",
            details: { message: upsertError.message },
          });
        }
      }

      // Links are written only when we resolved one. Writing a null would erase
      // a deal link made by hand in the CRM — an offer typed into Fortnox
      // carries no CRM reference, so the sync can never re-derive it, and the
      // link would silently vanish 15 minutes after it was made.
      for (const link of resolvedLinks) {
        const patch: Record<string, number> = {};
        if (link.companyId !== null) patch.company_id = link.companyId;
        if (link.dealId !== null) patch.deal_id = link.dealId;
        if (Object.keys(patch).length === 0) continue;

        const { error: linkError } = await supabaseAdmin
          .from("fortnox_offers")
          .update(patch)
          .eq("document_number", link.documentNumber);

        if (linkError) {
          console.warn("fortnox_sync_offers: could not link offer", {
            documentNumber: link.documentNumber,
            message: linkError.message,
          });
        }
      }

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
      console.error("fortnox_sync_offers failed:", message);

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
