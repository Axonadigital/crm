/**
 * Pulls Fortnox supplier invoices (leverantörsfakturor) into the
 * `fortnox_supplier_invoices` mirror — the cost side of the Ekonomi page.
 *
 * Always a FULL sync: the volume is small (a small company's supplier
 * invoices), and a payment booked after the fact must never be missed because
 * the row didn't register as "modified". Runs hourly from pg_cron, and can be
 * triggered by an admin from the UI ("Synka nu").
 *
 * Auth: x-cron-secret (pg_cron) or an admin CRM user. Never public.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { errorResponseFromUnknown, HttpError } from "../_shared/http.ts";
import { createFortnoxClient } from "../_shared/fortnox/index.ts";
import { mapSupplierInvoice } from "../_shared/fortnox/supplierInvoices.ts";

const RESOURCE = "supplier_invoices";
const PAGE_SIZE = 100;
// A guard, not a limit: 50 pages is 5 000 supplier invoices.
const MAX_PAGES = 50;

type FortnoxSupplierInvoiceListResponse = {
  MetaInformation?: { "@TotalPages"?: number; "@CurrentPage"?: number };
  SupplierInvoices?: Record<string, unknown>[];
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

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    const startedAt = new Date().toISOString();

    try {
      await authorize(req);

      const client = createFortnoxClient();

      const rows: Record<string, unknown>[] = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await client.get<FortnoxSupplierInvoiceListResponse>(
          "/3/supplierinvoices",
          { limit: PAGE_SIZE, page },
        );

        totalPages = response.MetaInformation?.["@TotalPages"] ?? 1;

        for (const raw of response.SupplierInvoices ?? []) {
          const row = mapSupplierInvoice(raw, startedAt);
          if (row) rows.push(row);
        }

        page++;
      } while (page <= totalPages && page <= MAX_PAGES);

      if (page > MAX_PAGES) {
        console.warn(
          "fortnox_sync_supplier_invoices: stopped at the page cap",
          {
            totalPages,
          },
        );
      }

      if (rows.length > 0) {
        const { error: upsertError } = await supabaseAdmin
          .from("fortnox_supplier_invoices")
          .upsert(rows, { onConflict: "given_number" });

        if (upsertError) {
          throw new HttpError(500, "Failed to write supplier invoice mirror", {
            code: "fortnox_supplier_mirror_write_failed",
            details: { message: upsertError.message },
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

      return createJsonResponse({ synced: rows.length, mode: "full" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("fortnox_sync_supplier_invoices failed:", message);

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
