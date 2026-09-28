/**
 * Mission Control heartbeat-mottagare.
 *
 * Schemalagda jobb (cron-runner på VPS:en, GitHub Actions, pg_cron) POST:ar
 * hit vid start/slut så MC:s System-panel kan visa hälsa per jobb utan att
 * VPS:en behöver någon publik ingress.
 *
 * Auth: enbart x-cron-secret (samma CRON_SECRET som pg_cron-anropen använder).
 * Ingen användar-auth — funktionen kan bara skriva heartbeats, aldrig läsa.
 *
 * Body: { job: string, status: "ok" | "running" | "failed",
 *         started_at?: ISO-sträng, message?: string, meta?: object }
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";

const VALID_STATUSES = new Set(["ok", "running", "failed"]);
const RETENTION_DAYS = 30;

type HeartbeatBody = {
  job?: unknown;
  status?: unknown;
  started_at?: unknown;
  message?: unknown;
  meta?: unknown;
};

function parseBody(body: HeartbeatBody) {
  const job = typeof body.job === "string" ? body.job.trim() : "";
  const status = typeof body.status === "string" ? body.status : "";
  if (!job || job.length > 100) {
    throw new Error("job krävs (sträng, max 100 tecken)");
  }
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`status måste vara en av: ${[...VALID_STATUSES].join(", ")}`);
  }
  const startedAt =
    typeof body.started_at === "string" && !Number.isNaN(Date.parse(body.started_at))
      ? body.started_at
      : new Date().toISOString();
  return {
    job,
    status,
    started_at: startedAt,
    finished_at: status === "running" ? null : new Date().toISOString(),
    message:
      typeof body.message === "string" ? body.message.slice(0, 500) : null,
    meta: body.meta && typeof body.meta === "object" ? body.meta : null,
  };
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

    let record;
    try {
      record = parseBody(await req.json());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return createErrorResponse(400, message);
    }

    const { error } = await supabaseAdmin
      .from("mc_job_heartbeats")
      .insert(record);
    if (error) {
      console.error("mc_heartbeat insert failed:", error.message);
      return createErrorResponse(500, error.message);
    }

    // Retention: rensa gamla rader för jobbet så tabellen inte växer obegränsat.
    const cutoff = new Date(
      Date.now() - RETENTION_DAYS * 864e5,
    ).toISOString();
    await supabaseAdmin
      .from("mc_job_heartbeats")
      .delete()
      .eq("job", record.job)
      .lt("started_at", cutoff);

    return createJsonResponse({ ok: true });
  }),
);
