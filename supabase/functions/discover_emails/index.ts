import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  bestEmailFromHtml,
  contactPageUrls,
  isThirdPartySite,
} from "../_shared/emailDiscovery.ts";

/**
 * Mejlutvinnaren — hämtar företagets adress från deras egen hemsida.
 *
 * Bakgrund (2026-09-11): 122 företag i CRM:et hade en hemsida men ingen
 * e-postadress, och föll därför ur leadkretsen redan vid enrollment
 * (outcome 'skipped_no_contact'). Enda källan vi hade var Serpers söksnuttar,
 * som nästan aldrig innehåller en adress. En stickprovskontroll mot nio
 * riktiga sajter hittade adressen på startsidan i nio fall av nio.
 *
 * Ordningen är medveten: startsidan först, kontaktsidan bara om startsidan
 * inte gav något. Det håller nere antalet anrop mot företagens servrar.
 *
 * Vi skriver ALDRIG över en befintlig adress — funktionen fyller bara tomma
 * fält, så en adress en människa lagt in vinner alltid.
 *
 * Auth: x-cron-secret (ingen användarkontext).
 */

const JOB_NAME = "discover-emails";
/** Företag per körning. Två sidhämtningar styck ryms väl i budgeten. */
const DEFAULT_BATCH = 25;
const TIME_BUDGET_MS = 100_000;
const FETCH_TIMEOUT_MS = 12_000;
/** Ett företag vi misslyckats med provas inte igen på två veckor. */
const RETRY_AFTER_DAYS = 14;
/** Samma User-Agent som auto_scrape — en del sajter blockerar tomma. */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type Row = Record<string, unknown>;

interface Counters {
  considered: number;
  found: number;
  notFound: number;
  thirdParty: number;
  fetchFailed: number;
  /** Loggrader som inte gick in — spärren mot återförsök är trasig om > 0. */
  logFailed: number;
}

async function heartbeat(
  status: "ok" | "failed",
  startedAt: string,
  message: string,
  meta: Row,
): Promise<void> {
  const { error } = await supabaseAdmin.from("mc_job_heartbeats").insert({
    job: JOB_NAME,
    status,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    message: message.slice(0, 500),
    meta,
  });
  if (error) console.error("heartbeat insert failed:", error.message);
}

/**
 * Loggar ett försök. Returnerar false om raden INTE gick in.
 *
 * Det spelar roll: återförsöksspärren bygger på de här raderna. Första
 * versionen console.error:ade bara, och när chk_enrichment_log_source
 * avvisade "email_discovery" föll allt tyst — jobbet såg ut att fungera
 * medan spärren var tom och samma sajter hämtades om och om igen. Nu
 * räknas misslyckandena och syns i körningens sammanfattning.
 */
async function logAttempt(
  companyId: number,
  status: "success" | "failed",
  data: Row,
  errorMessage?: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin.from("enrichment_log").insert({
    company_id: companyId,
    source: "email_discovery",
    status,
    enrichment_data: data,
    error_message: errorMessage ?? null,
  });
  if (error) {
    console.error("enrichment_log insert failed:", error.message);
    return false;
  }
  return true;
}

/** Hämtar en sida. Returnerar null i stället för att kasta. */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (type && !type.includes("html") && !type.includes("text")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    // Spårningsparametrar (fbclid m.fl.) gör bara URL:en längre.
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** En hemsida → en adress, eller null. */
async function discoverForCompany(
  company: Row,
): Promise<{ email: string | null; source: string; reason?: string }> {
  const rawSite = String(company.website ?? "");
  const site = normalizeUrl(rawSite);
  if (!site) return { email: null, source: "none", reason: "ogiltig_url" };

  if (isThirdPartySite(site)) {
    return { email: null, source: "none", reason: "tredjepartssajt" };
  }

  const domain = hostOf(site);
  const html = await fetchHtml(site);
  if (html === null) {
    return { email: null, source: "none", reason: "hamtning_misslyckades" };
  }

  const fromHome = bestEmailFromHtml(html, domain);
  if (fromHome) return { email: fromHome, source: site };

  for (const page of contactPageUrls(html, site)) {
    const sub = await fetchHtml(page);
    if (sub === null) continue;
    const found = bestEmailFromHtml(sub, domain);
    if (found) return { email: found, source: page };
  }

  return { email: null, source: "none", reason: "ingen_adress_pa_sajten" };
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret =
      req.headers.get("x-cron-secret") ||
      new URL(req.url).searchParams.get("secret");
    if (!cronSecret || providedSecret !== cronSecret) {
      return createErrorResponse(401, "Unauthorized");
    }
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    const startedAt = new Date().toISOString();
    const deadline = Date.now() + TIME_BUDGET_MS;
    const body = (await req.clone().json().catch(() => null)) as Row | null;
    const limit =
      body && typeof body.limit === "number" && body.limit > 0
        ? Math.min(body.limit, 100)
        : DEFAULT_BATCH;
    const dryRun = body?.dry_run === true;

    const counters: Counters = {
      considered: 0,
      found: 0,
      notFound: 0,
      thirdParty: 0,
      fetchFailed: 0,
      logFailed: 0,
    };
    const examples: Row[] = [];

    try {
      // Företag vi nyligen misslyckats med hoppas över, annars mal jobbet
      // samma hopplösa sajter varje körning.
      const since = new Date(
        Date.now() - RETRY_AFTER_DAYS * 86_400_000,
      ).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("enrichment_log")
        .select("company_id")
        .eq("source", "email_discovery")
        .gte("created_at", since);
      const skip = new Set(
        (recent ?? []).map((r) => Number((r as Row).company_id)),
      );

      const { data: companies, error } = await supabaseAdmin
        .from("companies")
        .select("id, name, website, email")
        .or("email.is.null,email.eq.")
        .not("website", "is", null)
        .neq("website", "")
        .order("id", { ascending: true })
        .limit(limit + skip.size);
      if (error) throw new Error(`companies-frågan misslyckades: ${error.message}`);

      for (const company of (companies ?? []) as Row[]) {
        if (Date.now() > deadline) break;
        if (counters.considered >= limit) break;
        if (skip.has(Number(company.id))) continue;
        counters.considered += 1;

        const result = await discoverForCompany(company);
        const companyId = Number(company.id);

        if (result.email) {
          counters.found += 1;
          if (!dryRun) {
            // Fyll bara tomt fält — en människas adress vinner alltid.
            const { error: updateError } = await supabaseAdmin
              .from("companies")
              .update({ email: result.email })
              .eq("id", companyId)
              .or("email.is.null,email.eq.");
            if (updateError) {
              console.error(`update ${companyId}:`, updateError.message);
            }
            const logged = await logAttempt(companyId, "success", {
              email: result.email,
              found_on: result.source,
            });
            if (!logged) counters.logFailed += 1;
          }
          if (examples.length < 15) {
            examples.push({
              company: company.name,
              email: result.email,
              found_on: result.source,
            });
          }
          continue;
        }

        if (result.reason === "tredjepartssajt") counters.thirdParty += 1;
        else if (result.reason === "hamtning_misslyckades") counters.fetchFailed += 1;
        else counters.notFound += 1;

        if (!dryRun) {
          const logged = await logAttempt(
            companyId,
            "failed",
            { website: company.website },
            result.reason,
          );
          if (!logged) counters.logFailed += 1;
        }
      }

      const summary =
        `${counters.found} adresser hittade av ${counters.considered} granskade ` +
        `(${counters.notFound} utan adress, ${counters.thirdParty} tredjepartssajt, ` +
        `${counters.fetchFailed} gick inte att hämta)` +
        (counters.logFailed > 0
          ? ` — VARNING: ${counters.logFailed} loggrader gick inte in, återförsöksspärren fungerar inte`
          : "");
      await heartbeat(
        counters.logFailed > 0 ? "failed" : "ok",
        startedAt,
        summary,
        { ...counters, dry_run: dryRun },
      );
      return createJsonResponse({
        success: true,
        dry_run: dryRun,
        ...counters,
        summary,
        examples,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await heartbeat("failed", startedAt, message, counters);
      return createErrorResponse(500, message);
    }
  }),
);
