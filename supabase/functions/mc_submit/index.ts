/**
 * Mission Control submit — agenternas enda skrivväg in i koordineringslagret.
 *
 * Anropas av cron-runner (VPS), Claude Code-jobb (mc-submit.mjs) och andra
 * edge functions. Auth: x-cron-secret (samma CRON_SECRET som pg_cron).
 *
 * Actions (body.action):
 *  - "run_start":   { agent_id, company_id?, summary? } → { run_id }
 *  - "run_finish":  { run_id, status: "succeeded"|"failed", cost_usd?, tokens?,
 *                     summary?, error?, trace_url? }
 *  - "approval":    { agent_id, run_id?, company_id?, type, title, body_md?,
 *                     payload?, expires_at? } → { approval_id }
 *
 * Okänd agent registreras automatiskt (enabled=true, autonomy=approval) så en
 * ny agent inte kräver manuell registrering. En AVSTÄNGD agent (enabled=false,
 * kill switch) nekas — det är så en skenande agent stoppas centralt.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";

type Body = Record<string, unknown>;

const str = (v: unknown, max = 500): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

async function ensureAgentEnabled(agentId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("mc_agents")
    .select("enabled, spend_limit_daily_usd")
    .eq("id", agentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { error: insertError } = await supabaseAdmin
      .from("mc_agents")
      .insert({ id: agentId, name: agentId });
    if (insertError) throw new Error(insertError.message);
    return;
  }
  if (data.enabled !== true) {
    throw new Error(`agenten "${agentId}" är avstängd (kill switch)`);
  }
  // Circuit breaker: dagens samlade kostnad mot agentens dagsbudget.
  const limit = data.spend_limit_daily_usd;
  if (limit != null) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: runs, error: runsError } = await supabaseAdmin
      .from("mc_runs")
      .select("cost_usd")
      .eq("agent_id", agentId)
      .gte("started_at", todayStart.toISOString())
      .not("cost_usd", "is", null);
    if (runsError) throw new Error(runsError.message);
    const spent = (runs || []).reduce(
      (sum, r) => sum + Number(r.cost_usd || 0),
      0,
    );
    if (spent >= Number(limit)) {
      throw new Error(
        `agenten "${agentId}" har nått sin dagsbudget ($${spent.toFixed(2)} av $${Number(limit).toFixed(2)})`,
      );
    }
  }
}

async function handleRunStart(body: Body) {
  const agentId = str(body.agent_id, 100);
  if (!agentId) throw new Error("agent_id krävs");
  await ensureAgentEnabled(agentId);
  const { data, error } = await supabaseAdmin
    .from("mc_runs")
    .insert({
      agent_id: agentId,
      company_id: num(body.company_id),
      summary: str(body.summary),
      status: "running",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { run_id: data.id };
}

async function handleRunFinish(body: Body) {
  const runId = num(body.run_id);
  const status = str(body.status, 20);
  if (!runId || !status || !["succeeded", "failed"].includes(status)) {
    throw new Error("run_id + status (succeeded|failed) krävs");
  }
  const { error } = await supabaseAdmin
    .from("mc_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      cost_usd: num(body.cost_usd),
      tokens: num(body.tokens),
      summary: str(body.summary),
      error: str(body.error),
      trace_url: str(body.trace_url, 1000),
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
  return { run_id: runId };
}

async function handleApproval(body: Body) {
  const agentId = str(body.agent_id, 100);
  const type = str(body.type, 50);
  const title = str(body.title, 200);
  if (!agentId || !type || !title) {
    throw new Error("agent_id + type + title krävs");
  }
  await ensureAgentEnabled(agentId);
  const { data, error } = await supabaseAdmin
    .from("mc_approvals")
    .insert({
      agent_id: agentId,
      run_id: num(body.run_id),
      company_id: num(body.company_id),
      type,
      title,
      body_md: str(body.body_md, 20000),
      payload:
        body.payload && typeof body.payload === "object" ? body.payload : null,
      expires_at: str(body.expires_at, 40),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("mc_approval_events").insert({
    approval_id: data.id,
    event: "created",
    actor: agentId,
  });
  return { approval_id: data.id };
}

Deno.serve((req) =>
  OptionsMiddleware(req, async (req) => {
    const cronSecret = Deno.env.get("CRON_SECRET");
    const provided = req.headers.get("x-cron-secret");
    if (!cronSecret || !provided || provided !== cronSecret) {
      return createErrorResponse(401, "Unauthorized");
    }
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method not allowed");
    }

    try {
      const body = (await req.json()) as Body;
      const action = str(body.action, 20);
      if (action === "run_start") {
        return createJsonResponse(await handleRunStart(body));
      }
      if (action === "run_finish") {
        return createJsonResponse(await handleRunFinish(body));
      }
      if (action === "approval") {
        return createJsonResponse(await handleApproval(body));
      }
      return createErrorResponse(
        400,
        "action måste vara run_start, run_finish eller approval",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("mc_submit failed:", message);
      return createErrorResponse(400, message);
    }
  }),
);
