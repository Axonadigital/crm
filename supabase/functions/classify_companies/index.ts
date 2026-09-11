import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { classifyCompany } from "../_shared/industrySegment.ts";

/**
 * Sätter companies.industry_segment — vilket ERBJUDANDE ett företag ska få.
 *
 * Logiken bor i _shared/industrySegment.ts och INTE i en SQL-funktion, så
 * det finns en enda sanningskälla med tester bakom sig i stället för två
 * kopior som glider isär.
 *
 * Körs varje timme av pg_cron via public.run_lead_data_job(). Kostar inget
 * externt — all indata finns redan i databasen.
 *
 * Auth: x-cron-secret (ingen användarkontext).
 */

const JOB_NAME = "classify-companies";
const DEFAULT_BATCH = 200;

type Row = Record<string, unknown>;

/** Allabolag-länken, från kolumnen eller ur den sparade Serper-träffen. */
function allabolagUrl(company: Row): string | null {
  const direct = company.allabolag_url;
  if (typeof direct === "string" && direct.includes("allabolag.se")) {
    return direct;
  }
  const discovery = (company.enrichment_data as Row | null)?.serper_discovery as
    | Row
    | undefined;
  const links = discovery?.context_links;
  if (!Array.isArray(links)) return null;
  for (const item of links) {
    const url = (item as Row)?.url;
    if (typeof url === "string" && url.includes("allabolag.se/foretag/")) {
      return url;
    }
  }
  return null;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided =
      req.headers.get("x-cron-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (!cronSecret || provided !== cronSecret) {
      return createErrorResponse(401, "Unauthorized");
    }
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    const startedAt = new Date().toISOString();
    const body = (await req.clone().json().catch(() => null)) as Row | null;
    const limit =
      typeof body?.limit === "number" && body.limit > 0
        ? Math.min(body.limit, 500)
        : DEFAULT_BATCH;
    const dryRun = body?.dry_run === true;
    // Som standard bara oklassade. force=true klassar om allt, vilket
    // behövs när mönstren i industrySegment.ts har ändrats.
    const force = body?.force === true;

    try {
      let query = supabaseAdmin
        .from("companies")
        .select("id, name, industry, sni_code, allabolag_url, enrichment_data")
        .order("id", { ascending: true })
        .limit(limit);
      if (!force) query = query.is("industry_segment", null);

      const { data: companies, error } = await query;
      if (error) throw new Error(error.message);

      const bySegment: Record<string, number> = {};
      const bySource: Record<string, number> = {};
      let updated = 0;

      for (const company of (companies ?? []) as Row[]) {
        const result = classifyCompany({
          name: company.name as string | null,
          industry: company.industry as string | null,
          sniCode: company.sni_code as string | null,
          allabolagUrl: allabolagUrl(company),
        });
        bySegment[result.segment] = (bySegment[result.segment] ?? 0) + 1;
        bySource[result.source] = (bySource[result.source] ?? 0) + 1;

        if (dryRun) continue;
        const { error: updateError } = await supabaseAdmin
          .from("companies")
          .update({
            industry_segment: result.segment,
            industry_segment_source: result.source,
            industry_segment_at: new Date().toISOString(),
          })
          .eq("id", company.id as number);
        if (updateError) {
          console.error(`classify ${company.id}:`, updateError.message);
          continue;
        }
        updated += 1;
      }

      const known = (companies ?? []).length - (bySegment.ovrigt ?? 0);
      const summary =
        `${updated} klassade av ${(companies ?? []).length} ` +
        `(${known} fick en bransch, ${bySegment.ovrigt ?? 0} blev ovrigt)`;
      await supabaseAdmin.from("mc_job_heartbeats").insert({
        job: JOB_NAME,
        status: "ok",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        message: summary.slice(0, 500),
        meta: { by_segment: bySegment, by_source: bySource, dry_run: dryRun },
      });

      return createJsonResponse({
        success: true,
        dry_run: dryRun,
        considered: (companies ?? []).length,
        updated,
        by_segment: bySegment,
        by_source: bySource,
        summary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.from("mc_job_heartbeats").insert({
        job: JOB_NAME,
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        message: message.slice(0, 500),
        meta: {},
      });
      return createErrorResponse(500, message);
    }
  }),
);
