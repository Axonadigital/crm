/**
 * Creates Fortnox vouchers (verifikationer) from a reviewed list.
 *
 * Why: Fortnox's public API has no bank feed, so card-drawn subscriptions can
 * only be booked by posting vouchers built from a bank export. This function
 * is the single write path for that. It never decides accounts itself — the
 * caller sends fully specified rows that a human has approved.
 *
 * Safety rails:
 *   - `dry_run: true` validates, resolves financial years and runs the
 *     duplicate check without touching Fortnox. Default is dry run.
 *   - Duplicate check against the voucher mirror: same date + same bank
 *     movement + same description => skipped. Created vouchers are written to
 *     the mirror immediately, so a retry within the hour is also caught.
 *   - Vouchers in Fortnox cannot be deleted, only reversed. Nothing here is
 *     automatic: auth is x-cron-secret (internal tooling) or an admin user.
 *
 * Request:  { vouchers: VoucherInput[], dry_run?: boolean }
 * Response: { dry_run, created, skipped, failed, results: [...] }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import {
  errorResponseFromUnknown,
  HttpError,
  parseRequiredJsonBody,
} from "../_shared/http.ts";
import { createFortnoxClient, FortnoxError } from "../_shared/fortnox/index.ts";
import { mapVoucherDetail } from "../_shared/fortnox/vouchers.ts";
import {
  bankAmount,
  buildVoucherPayload,
  type VoucherInput,
} from "../_shared/fortnox/voucherCreate.ts";

const MAX_VOUCHERS_PER_CALL = 100;

type FinancialYear = { Id: number; FromDate: string; ToDate: string };
type FinancialYearsResponse = { FinancialYears?: FinancialYear[] };

type ResultStatus = "created" | "would_create" | "skipped_duplicate" | "failed";

type VoucherResult = {
  external_id: string;
  status: ResultStatus;
  voucher_series?: string;
  voucher_number?: number;
  financial_year?: number;
  message?: string;
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

function parseVouchers(body: Record<string, unknown>): VoucherInput[] {
  const raw = body.vouchers;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new HttpError(400, "vouchers must be a non-empty array", {
      code: "invalid_body",
    });
  }
  if (raw.length > MAX_VOUCHERS_PER_CALL) {
    throw new HttpError(400, `At most ${MAX_VOUCHERS_PER_CALL} vouchers per call`, {
      code: "too_many",
    });
  }
  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new HttpError(400, `vouchers[${index}] must be an object`);
    }
    const v = item as Record<string, unknown>;
    return {
      external_id: String(v.external_id ?? `row-${index}`),
      description: String(v.description ?? ""),
      transaction_date: String(v.transaction_date ?? ""),
      voucher_series:
        typeof v.voucher_series === "string" ? v.voucher_series : undefined,
      rows: Array.isArray(v.rows)
        ? v.rows.map((r) => {
            const row = r as Record<string, unknown>;
            return {
              account: Number(row.account),
              debit: row.debit === undefined ? undefined : Number(row.debit),
              credit: row.credit === undefined ? undefined : Number(row.credit),
            };
          })
        : [],
    };
  });
}

function financialYearFor(
  years: FinancialYear[],
  date: string,
): number | null {
  const hit = years.find((y) => y.FromDate <= date && date <= y.ToDate);
  return hit ? hit.Id : null;
}

/**
 * A voucher on the same date, with the same description and the same bank
 * movement, already exists in the mirror. Good enough to stop a double post
 * from a retried batch; two genuinely identical charges on one day would need
 * distinct descriptions (the caller can suffix them).
 */
async function isDuplicate(input: VoucherInput): Promise<boolean> {
  const bank = bankAmount(input.rows);
  const { data: heads, error } = await supabaseAdmin
    .from("fortnox_vouchers")
    .select("voucher_series, voucher_number, financial_year")
    .eq("voucher_date", input.transaction_date)
    .eq("description", input.description.trim());
  if (error) {
    throw new HttpError(500, "Failed to read voucher mirror", {
      details: { message: error.message },
    });
  }
  if (!heads || heads.length === 0) return false;

  for (const head of heads) {
    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("fortnox_voucher_rows")
      .select("debit, credit")
      .eq("voucher_series", head.voucher_series)
      .eq("voucher_number", head.voucher_number)
      .eq("financial_year", head.financial_year)
      .eq("account", 1930);
    if (rowsError) {
      throw new HttpError(500, "Failed to read voucher rows", {
        details: { message: rowsError.message },
      });
    }
    const debit = (rows ?? []).reduce((s, r) => s + Number(r.debit ?? 0), 0);
    const credit = (rows ?? []).reduce((s, r) => s + Number(r.credit ?? 0), 0);
    if (
      Math.abs(debit - bank.debit) < 0.005 &&
      Math.abs(credit - bank.credit) < 0.005
    ) {
      return true;
    }
  }
  return false;
}

async function mirrorCreated(
  detail: Record<string, unknown>,
  financialYear: number,
): Promise<void> {
  const mapped = mapVoucherDetail(detail, financialYear, new Date().toISOString());
  if (!mapped) return;
  const { error } = await supabaseAdmin
    .from("fortnox_vouchers")
    .upsert([mapped.voucher], {
      onConflict: "voucher_series,voucher_number,financial_year",
    });
  if (error) {
    console.error("mirror head upsert failed:", error.message);
    return;
  }
  if (mapped.rows.length > 0) {
    const { error: rowsError } = await supabaseAdmin
      .from("fortnox_voucher_rows")
      .upsert(mapped.rows, {
        onConflict: "voucher_series,voucher_number,financial_year,row_index",
      });
    if (rowsError) console.error("mirror rows upsert failed:", rowsError.message);
  }
}

Deno.serve((req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      await authorize(req);
      const body = await parseRequiredJsonBody(req);
      const dryRun = body.dry_run !== false;
      const inputs = parseVouchers(body);

      const client = createFortnoxClient();
      const yearsResponse =
        await client.get<FinancialYearsResponse>("/3/financialyears");
      const years = yearsResponse.FinancialYears ?? [];

      const results: VoucherResult[] = [];

      for (const input of inputs) {
        const result: VoucherResult = {
          external_id: input.external_id,
          status: "failed",
        };
        results.push(result);

        try {
          const payload = buildVoucherPayload(input);
          const financialYear = financialYearFor(years, input.transaction_date);
          if (financialYear === null) {
            result.message = `No open financial year covers ${input.transaction_date}`;
            continue;
          }
          result.financial_year = financialYear;

          if (await isDuplicate(input)) {
            result.status = "skipped_duplicate";
            continue;
          }

          if (dryRun) {
            result.status = "would_create";
            continue;
          }

          const created = await client.post<Record<string, unknown>>(
            "/3/vouchers",
            payload,
            { financialyear: financialYear },
          );
          const voucher = (created.Voucher ?? created) as Record<string, unknown>;
          result.status = "created";
          result.voucher_series = String(voucher.VoucherSeries ?? "");
          result.voucher_number = Number(voucher.VoucherNumber);
          await mirrorCreated(created, financialYear);
        } catch (error) {
          result.status = "failed";
          result.message =
            error instanceof FortnoxError
              ? `Fortnox ${error.status}: ${error.message}`
              : error instanceof Error
                ? error.message
                : String(error);
          console.error(
            `fortnox_create_vouchers ${input.external_id} failed:`,
            result.message,
          );
        }
      }

      const count = (status: ResultStatus) =>
        results.filter((r) => r.status === status).length;

      return createJsonResponse({
        dry_run: dryRun,
        created: count("created"),
        would_create: count("would_create"),
        skipped: count("skipped_duplicate"),
        failed: count("failed"),
        results,
      });
    } catch (error) {
      console.error("fortnox_create_vouchers failed:", error);
      return errorResponseFromUnknown(error);
    }
  }),
);
