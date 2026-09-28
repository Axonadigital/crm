/**
 * Tar emot veckans nya bolag i Jämtlands län från GitHub-jobbet
 * (.github/workflows/nystartade.yml) och lägger in dem i CRM:et.
 *
 * Body: { lines: string[], since: "YYYY-MM-DD", dry_run?: boolean }
 *   lines = rader ur SCB:s bulkfil, redan omkodade till UTF-8 och grovsållade
 *   på postnummer och datum. Tolkningen och reglerna: _shared/nystartade.ts.
 * Auth: x-import-secret = NYSTARTADE_SECRET (egen hemlighet, så att
 *   GitHub aldrig behöver service-nyckeln eller CRON_SECRET).
 *
 * Vad som händer sedan sköts av databasen (migration 20260928150000):
 * berikning varje vecka tills mejl eller telefon dykt upp, därefter
 * mejlflödet (AB/HB) eller ringlistan (enskild firma).
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { type NewCompany, parseScbLine } from "../_shared/nystartade.ts";

const MAX_LINES = 3000;
export const SOURCE = "scb_nystartat";

Deno.serve((req) =>
  OptionsMiddleware(req, async (req) => {
    const secret = Deno.env.get("NYSTARTADE_SECRET");
    if (!secret || req.headers.get("x-import-secret") !== secret) return createErrorResponse(401, "Unauthorized");
    if (req.method !== "POST") return createErrorResponse(405, "Method not allowed");

    let body: { lines?: unknown; since?: unknown; dry_run?: unknown };
    try {
      body = await req.json();
    } catch {
      return createErrorResponse(400, "Ogiltig JSON");
    }
    const lines = Array.isArray(body.lines) ? body.lines.filter((l): l is string => typeof l === "string") : [];
    const since = typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : null;
    if (!since) return createErrorResponse(400, "since saknas (YYYY-MM-DD)");
    if (lines.length > MAX_LINES) return createErrorResponse(413, `högst ${MAX_LINES} rader`);
    const dryRun = body.dry_run === true;

    const skipped: Record<string, number> = {};
    const parsed: NewCompany[] = [];
    for (const line of lines) {
      const r = parseScbLine(line, since);
      if (r.ok) parsed.push(r.company);
      else skipped[r.reason] = (skipped[r.reason] ?? 0) + 1;
    }
    // Samma bolag kan stå två gånger i filen (ändringsposter).
    const unique = [...new Map(parsed.map((c) => [c.dedupe_key, c])).values()];

    try {
      const orgs = unique.map((c) => c.org_number).filter((o): o is string => o != null);
      const orgVariants = orgs.flatMap((o) => [o, o.replace("-", "")]);
      const { data: byOrg } = orgVariants.length
        ? await supabaseAdmin.from("companies").select("org_number").in("org_number", orgVariants)
        : { data: [] };
      const knownOrg = new Set((byOrg ?? []).map((r) => String(r.org_number).replace("-", "")));
      const keys = unique.map((c) => c.dedupe_key);
      const { data: byKey } = await supabaseAdmin
        .from("companies")
        .select("enrichment_data")
        .eq("source", SOURCE)
        .in("enrichment_data->scb->>dedupe_key", keys);
      const knownKey = new Set((byKey ?? []).map((r) => (r.enrichment_data as { scb?: { dedupe_key?: string } })?.scb?.dedupe_key));

      const fresh = unique.filter((c) => !knownKey.has(c.dedupe_key) && !(c.org_number && knownOrg.has(c.org_number.replace("-", ""))));
      const rows = fresh.map((c) => ({
        name: c.name,
        org_number: c.org_number,
        address: c.address,
        zipcode: c.zipcode,
        city: c.city,
        country: "Sverige",
        sni_code: c.sni_code,
        source: SOURCE,
        lead_status: "new",
        tags: ["nystartat"],
        has_website: null,
        enrichment_data: { scb: { reg_date: c.reg_date, form: c.form, sni: c.sni_code, dedupe_key: c.dedupe_key, imported_at: new Date().toISOString() } },
      }));

      if (!dryRun && rows.length > 0) {
        const { error } = await supabaseAdmin.from("companies").insert(rows);
        if (error) throw new Error(error.message);
      }
      const byForm = (f: string) => fresh.filter((c) => c.form === f).length;
      return createJsonResponse({
        ok: true, dry_run: dryRun, since, lines: lines.length, parsed: parsed.length,
        already_known: unique.length - fresh.length, inserted: dryRun ? 0 : rows.length,
        new_ab: byForm("ab"), new_hb: byForm("hb"), new_enskild: byForm("enskild"), skipped,
        sample: fresh.slice(0, 5).map((c) => `${c.name} (${c.form}, ${c.city}, ${c.reg_date})`),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("import_new_companies:", message);
      return createErrorResponse(500, message);
    }
  }));
