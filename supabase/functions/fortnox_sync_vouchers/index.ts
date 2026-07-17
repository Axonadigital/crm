/**
 * Pulls Fortnox vouchers (verifikationer / bokföring) into the
 * `fortnox_vouchers` + `fortnox_voucher_rows` mirror — the real cost side of
 * the Ekonomi page.
 *
 * Why vouchers and not just supplier invoices: the company runs on the cash
 * method, so most costs are subscriptions drawn straight from the bank account
 * and never become supplier invoices. Every one of them IS a voucher, and the
 * voucher Description names the vendor — which is what makes named-subscription
 * tracking possible.
 *
 * Incremental by construction: vouchers are immutable once booked. Each run
 * lists the voucher keys per financial year (cheap), diffs them against what we
 * already mirror, and fetches detail only for the new ones — capped per run so
 * a first-time backfill spreads over a few cron ticks instead of timing out.
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
  mapVoucherDetail,
  type VoucherKey,
  voucherKeyFromList,
} from "../_shared/fortnox/vouchers.ts";

const RESOURCE = "vouchers";
const PAGE_SIZE = 100;
// Guards, not limits: 50 pages = 5 000 vouchers per year.
const MAX_PAGES = 50;
// Cap on detail fetches per run so a backfill (216 vouchers on this tenant)
// spreads over a few cron ticks. Steady state fetches 0–2 per run.
const MAX_DETAIL_FETCHES = 100;

type FinancialYearsResponse = {
  FinancialYears?: { Id?: number }[];
};

type VoucherListResponse = {
  MetaInformation?: { "@TotalPages"?: number };
  Vouchers?: Record<string, unknown>[];
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

const keyString = (k: VoucherKey) => `${k.series}|${k.number}|${k.year}`;

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    const startedAt = new Date().toISOString();

    try {
      await authorize(req);

      const client = createFortnoxClient();

      // 1. Which financial years exist? Newest first, so the current year (the
      //    one the balance sheet is about) backfills before older ones.
      const yearsResponse =
        await client.get<FinancialYearsResponse>("/3/financialyears");
      const years = (yearsResponse.FinancialYears ?? [])
        .map((y) => y.Id)
        .filter((id): id is number => typeof id === "number")
        .sort((a, b) => b - a);

      if (years.length === 0) {
        throw new HttpError(502, "Fortnox returned no financial years");
      }

      // 2. List every voucher key across all years (cheap — no rows/amounts).
      const allKeys: VoucherKey[] = [];
      for (const year of years) {
        let page = 1;
        let totalPages = 1;
        do {
          const response = await client.get<VoucherListResponse>(
            "/3/vouchers",
            { financialyear: year, limit: PAGE_SIZE, page },
          );
          totalPages = response.MetaInformation?.["@TotalPages"] ?? 1;
          for (const raw of response.Vouchers ?? []) {
            const key = voucherKeyFromList(raw, year);
            if (key) allKeys.push(key);
          }
          page++;
        } while (page <= totalPages && page <= MAX_PAGES);
      }

      // 3. Diff against what we already mirror.
      const { data: existingRows, error: existingError } = await supabaseAdmin
        .from("fortnox_vouchers")
        .select("voucher_series, voucher_number, financial_year");
      if (existingError) {
        throw new HttpError(500, "Failed to read voucher mirror", {
          details: { message: existingError.message },
        });
      }
      const existing = new Set(
        (existingRows ?? []).map((r) =>
          keyString({
            series: r.voucher_series as string,
            number: r.voucher_number as number,
            year: r.financial_year as number,
          }),
        ),
      );

      const missing = allKeys.filter((k) => !existing.has(keyString(k)));
      const batch = missing.slice(0, MAX_DETAIL_FETCHES);

      // 4. Fetch detail for the new vouchers only.
      const voucherRecords: Record<string, unknown>[] = [];
      const rowRecords: Record<string, unknown>[] = [];

      for (const key of batch) {
        const detail = await client.get<Record<string, unknown>>(
          `/3/vouchers/${key.series}/${key.number}`,
          { financialyear: key.year },
        );
        const mapped = mapVoucherDetail(detail, key.year, startedAt);
        if (!mapped) continue;
        voucherRecords.push(mapped.voucher);
        for (const row of mapped.rows) rowRecords.push(row);
      }

      // 5. Write head before rows (FK). Upsert keeps it idempotent against a
      //    partial previous run.
      if (voucherRecords.length > 0) {
        const { error } = await supabaseAdmin
          .from("fortnox_vouchers")
          .upsert(voucherRecords, {
            onConflict: "voucher_series,voucher_number,financial_year",
          });
        if (error) {
          throw new HttpError(500, "Failed to write voucher mirror", {
            details: { message: error.message },
          });
        }
      }

      if (rowRecords.length > 0) {
        const { error } = await supabaseAdmin
          .from("fortnox_voucher_rows")
          .upsert(rowRecords, {
            onConflict:
              "voucher_series,voucher_number,financial_year,row_index",
          });
        if (error) {
          throw new HttpError(500, "Failed to write voucher rows", {
            details: { message: error.message },
          });
        }
      }

      const remaining = missing.length - batch.length;

      await supabaseAdmin.from("fortnox_sync_state").upsert(
        {
          resource: RESOURCE,
          last_synced_at: startedAt,
          last_run_at: new Date().toISOString(),
          last_error: null,
          rows_synced: voucherRecords.length,
        },
        { onConflict: "resource" },
      );

      return createJsonResponse({
        synced: voucherRecords.length,
        rows: rowRecords.length,
        remaining,
        total_in_fortnox: allKeys.length,
        financial_years: years,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("fortnox_sync_vouchers failed:", message);

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
