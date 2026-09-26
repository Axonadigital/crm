/**
 * Förslagsagenten — bygger leveransen till steg 2 i outreach-flödet.
 *
 * För varje aktiv enrollment vars krokfamilj kräver en bild (slow-mobile,
 * poor-crux, not-mobile, parked, no-site) och som ännu saknar asset_url:
 *  1. hämta företaget och senaste skanningen
 *  2. be renderingstjänsten på VPS:en (POST /proposal) om före/efter-bilden:
 *     leadets sida i mobilen till vänster, en komplett startsida byggd på
 *     deras egen logga, egna foton, egna texter och egna kontaktuppgifter
 *     till höger. Inget hittas på — se scanner/render-service/proposal-content.mjs.
 *  3. ladda upp JPEG:en till den publika bucketen scanner-screenshots
 *  4. sätt asset_url på enrollmenten och stäng produktionsuppgiften
 *
 * Steg 2 går sedan av sig självt via process_sequences när steget förfaller.
 * Tre misslyckade byggen ⇒ agenten släpper enrollmenten och uppgiften
 * ligger kvar för en människa (sidan /outreach, "Väntar på leverans").
 *
 * Kill switch: mc_agents.enabled för 'forslag-agent'. Torrläget i
 * mc_settings.sequences påverkar inte bygget — bilden skickas inte här, det
 * gör motorn, och den lyder torrläget.
 *
 * Auth: x-cron-secret (pg_cron var 10:e minut via run_build_proposal_assets).
 * Body: { limit?: number, enrollment_id?: number } — enrollment_id bygger
 * bara den, oavsett kö, för manuell omkörning.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { familyFor } from "../_shared/krokCopy.ts";
import {
  ASSET_BUCKET,
  assetOwner,
  assetPath,
  assetPublicUrl,
  familiesNeedingAsset,
  MAX_ASSET_BYTES,
  MAX_BUILD_ATTEMPTS,
  MAX_BUILDS_PER_RUN,
  proposalEndpoint,
  proposalRequestFor,
  taskDoneNote,
} from "../_shared/proposalAsset.ts";

const AGENT_ID = "forslag-agent";
const RENDER_TIMEOUT_MS = 130_000;

type Row = Record<string, unknown>;

interface Outcome {
  enrollment_id: number;
  company_id: number | null;
  status: "built" | "failed" | "handed_over";
  url?: string;
  error?: string;
  bytes?: number;
}

async function agentEnabled(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("mc_agents")
    .select("enabled")
    .eq("id", AGENT_ID)
    .maybeSingle();
  // Saknas raden är agenten inte registrerad än — hellre bygga än stå still,
  // migrationen registrerar den.
  return data ? data.enabled === true : true;
}

/** Enrollments som väntar på en bild, äldst förfallodatum först. */
async function pendingEnrollments(limit: number, onlyId: number | null): Promise<Row[]> {
  let query = supabaseAdmin
    .from("sequence_enrollments")
    .select("id, company_id, contact_id, sequence_id, current_step, krok_familj, asset_url, asset_attempts, asset_task_id, next_action_at")
    .eq("status", "active")
    .is("asset_url", null)
    .in("krok_familj", familiesNeedingAsset())
    .lt("asset_attempts", MAX_BUILD_ATTEMPTS)
    .order("next_action_at", { ascending: true })
    .limit(limit);
  if (onlyId != null) query = query.eq("id", onlyId);
  const { data, error } = await query;
  if (error) throw new Error(`sequence_enrollments: ${error.message}`);
  return (data ?? []) as Row[];
}

async function companyFor(companyId: unknown): Promise<Row | null> {
  if (companyId == null) return null;
  const { data } = await supabaseAdmin
    .from("companies")
    .select("id, name, website, phone_number, city, address")
    .eq("id", companyId)
    .maybeSingle();
  return data as Row | null;
}

/** Rubriken på fyndet mejl ett citerade, för samma mätvärde under "Nu". */
async function findingTitleFor(companyId: unknown, family: string | null): Promise<string | null> {
  if (companyId == null) return null;
  const { data } = await supabaseAdmin
    .from("company_latest_scan")
    .select("findings")
    .eq("company_id", companyId)
    .maybeSingle();
  const krok = familyFor(data?.findings);
  return krok && krok.family === family ? krok.finding.title : null;
}

async function renderProposal(request: unknown): Promise<{ jpeg: Uint8Array; facts: Row }> {
  const base = Deno.env.get("RENDER_SERVICE_URL");
  if (!base) throw new Error("RENDER_SERVICE_URL saknas");
  const secret = Deno.env.get("RENDER_SERVICE_SECRET") ?? "";
  const res = await fetch(proposalEndpoint(base), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-render-secret": secret } : {}),
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`renderaren svarade ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { jpeg?: string; facts?: Row };
  if (!data.jpeg) throw new Error("renderaren gav ingen bild");
  const jpeg = Uint8Array.from(atob(data.jpeg), (c) => c.charCodeAt(0));
  if (jpeg.length < 20_000) throw new Error(`bilden är misstänkt liten (${jpeg.length} byte)`);
  if (jpeg.length > MAX_ASSET_BYTES) throw new Error(`bilden är för stor (${jpeg.length} byte)`);
  return { jpeg, facts: data.facts ?? {} };
}

async function upload(path: string, jpeg: Uint8Array): Promise<string> {
  const { error } = await supabaseAdmin.storage
    .from(ASSET_BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" });
  if (error) throw new Error(`uppladdning: ${error.message}`);
  return assetPublicUrl(Deno.env.get("SUPABASE_URL") ?? "", path);
}

async function closeTask(taskId: unknown, note: string): Promise<void> {
  if (taskId == null) return;
  const { data } = await supabaseAdmin.from("tasks").select("text").eq("id", taskId).maybeSingle();
  await supabaseAdmin
    .from("tasks")
    .update({ done_date: new Date().toISOString(), text: `${data?.text ?? ""} ${note}`.trim() })
    .eq("id", taskId)
    .is("done_date", null);
}

async function logRun(enrollment: Row, outcome: "asset_built" | "asset_failed", detail: Row): Promise<void> {
  const { error } = await supabaseAdmin.from("sequence_run_log").insert({
    enrollment_id: enrollment.id,
    sequence_id: enrollment.sequence_id,
    contact_id: enrollment.contact_id,
    company_id: enrollment.company_id ?? null,
    step: 2,
    action_type: "send_email",
    outcome,
    reasons: [],
    detail,
  });
  if (error) console.error("sequence_run_log insert failed:", error.message);
}

async function mcRun(companyId: unknown, status: "succeeded" | "failed", summary: string, error?: string) {
  const now = new Date().toISOString();
  await supabaseAdmin.from("mc_runs").insert({
    agent_id: AGENT_ID,
    company_id: companyId ?? null,
    status,
    started_at: now,
    finished_at: now,
    summary: summary.slice(0, 500),
    error: error?.slice(0, 500) ?? null,
  });
}

async function buildOne(enrollment: Row): Promise<Outcome> {
  const id = enrollment.id as number;
  const companyId = (enrollment.company_id as number | null) ?? null;
  const family = (enrollment.krok_familj as string | null) ?? null;
  const company = await companyFor(companyId);
  const name = String(company?.name ?? `enrollment ${id}`);
  try {
    const request = proposalRequestFor(family, company, await findingTitleFor(companyId, family));
    const { jpeg, facts } = await renderProposal(request);
    const url = await upload(assetPath(id), jpeg);
    const { error } = await supabaseAdmin
      .from("sequence_enrollments")
      .update({
        asset_url: url,
        asset_built_at: new Date().toISOString(),
        asset_attempts: ((enrollment.asset_attempts as number) ?? 0) + 1,
      })
      .eq("id", id)
      .is("asset_url", null);
    if (error) throw new Error(`enrollment: ${error.message}`);
    await closeTask(enrollment.asset_task_id, taskDoneNote(url, facts as { logo?: boolean; photos?: number; services?: string[] }));
    await logRun(enrollment, "asset_built", { url, bytes: jpeg.length, facts, request: { ...request, facts: undefined } });
    await mcRun(companyId, "succeeded", `${name}: bild byggd (${family})`);
    return { enrollment_id: id, company_id: companyId, status: "built", url, bytes: jpeg.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const attempts = ((enrollment.asset_attempts as number) ?? 0) + 1;
    await supabaseAdmin.from("sequence_enrollments").update({ asset_attempts: attempts }).eq("id", id);
    const handedOver = attempts >= MAX_BUILD_ATTEMPTS;
    await logRun(enrollment, "asset_failed", { error: message, attempts, handed_over: handedOver });
    await mcRun(companyId, "failed", `${name}: bygget misslyckades (försök ${attempts}/${MAX_BUILD_ATTEMPTS})`, message);
    console.error(`build_proposal_assets: enrollment ${id}: ${message}`);
    return { enrollment_id: id, company_id: companyId, status: handedOver ? "handed_over" : "failed", error: message };
  }
}

Deno.serve((req) =>
  OptionsMiddleware(req, async (req) => {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret");
    if (!cronSecret || provided !== cronSecret) return createErrorResponse(401, "Unauthorized");
    if (req.method !== "POST") return createErrorResponse(405, "Method not allowed");

    let body: Row = {};
    try {
      body = (await req.json()) as Row;
    } catch {
      body = {};
    }
    const onlyId = typeof body.enrollment_id === "number" ? body.enrollment_id : null;
    const limit = Math.min(Math.max(Number(body.limit) || MAX_BUILDS_PER_RUN, 1), MAX_BUILDS_PER_RUN);

    try {
      if (!(await agentEnabled())) {
        return createJsonResponse({ ok: true, skipped: "agenten är avstängd (kill switch)", outcomes: [] });
      }
      const pending = await pendingEnrollments(limit, onlyId);
      const outcomes: Outcome[] = [];
      for (const enrollment of pending) {
        if (assetOwner(enrollment) !== "agent") continue;
        outcomes.push(await buildOne(enrollment));
      }
      return createJsonResponse({
        ok: true,
        considered: pending.length,
        built: outcomes.filter((o) => o.status === "built").length,
        failed: outcomes.filter((o) => o.status !== "built").length,
        outcomes,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("build_proposal_assets failed:", message);
      return createErrorResponse(500, message);
    }
  }),
);
