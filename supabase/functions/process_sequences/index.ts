import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { checkGate, type GateVerdict } from "../_shared/outreachGate.ts";
import {
  lowerFirst,
  scanTopIssue,
  websiteHost,
} from "../_shared/templateVars.ts";
import { gmailConfigFromEnv, sendViaGmail } from "../_shared/gmail.ts";

/**
 * Process Sequences Edge Function
 *
 * Anropas var 5:e minut av pg_cron via public.run_process_sequences()
 * (migration 20260909120000). Hittar aktiva enrollments med förfallet
 * next_action_at, kör nästa steg och flyttar fram — MED tre skydd som
 * saknades i den första versionen:
 *
 *  1. Grinden: public.is_suppressed() frågas för varje enrollment innan
 *     något steg körs. Befintlig kund, sagt nej, enskild firma utan
 *     samtycke, studs, avregistrerad → enrollment pausas, inget skickas.
 *  2. Torrläge: mc_settings.sequences.dry_run (default true). I torrläge
 *     renderas mejlet, loggas i sequence_run_log, men INGET skickas och
 *     INGET tillstånd ändras. Loggen är granskningsytan innan skarpt läge.
 *  3. Dygnstak: mc_settings.sequences.daily_cap — skyddar avsändarryktet
 *     på utkorgsdomänen medan volymen trappas upp.
 *
 * Utkorgen skickas via Gmail-API:t från axonadigital.com (se _shared/gmail.ts),
 * ALDRIG via Resend. Resends villkor förbjuder kall utkorg och skiljer inte på
 * marknadsföring och transaktionsmejl, så ett stängt konto hade tagit offerter,
 * avtalsmejl och kundrapporter med sig.
 *
 * Varje körning lämnar ett heartbeat i mc_job_heartbeats så MC ser jobbet.
 * Auth: x-cron-secret (ingen användarkontext).
 */

const BATCH_SIZE = 50;
const JOB_NAME = "process-sequences";
const DEFAULT_DAILY_CAP = 30;
const CAP_LOG_DEDUPE_MINUTES = 60;

type Row = Record<string, unknown>;
type Outcome =
  | "sent"
  | "executed"
  | "dry_run"
  | "skipped_suppressed"
  | "skipped_cap"
  | "completed"
  | "failed";

interface Settings {
  dryRun: boolean;
  dailyCap: number;
}

interface StepResult {
  success: boolean;
  error?: string;
}

interface PreparedEmail {
  to: string;
  subject: string;
  body: string;
  templateId: number;
  companyId: number | null;
}

// --- Inställningar, logg, heartbeat ---

/** Saknas raden eller är den trasig → torrläge. Fail-safe åt det hållet. */
async function loadSettings(): Promise<Settings> {
  const { data } = await supabaseAdmin
    .from("mc_settings")
    .select("value")
    .eq("key", "sequences")
    .maybeSingle();
  const value = (data?.value ?? {}) as Row;
  const cap = Number(value.daily_cap);
  return {
    dryRun: value.dry_run !== false,
    dailyCap: Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DAILY_CAP,
  };
}

async function logRun(entry: {
  enrollment: Row;
  step: number;
  actionType: string | null;
  outcome: Outcome;
  reasons?: string[];
  detail?: Row;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("sequence_run_log").insert({
    enrollment_id: entry.enrollment.id,
    sequence_id: entry.enrollment.sequence_id,
    contact_id: entry.enrollment.contact_id,
    company_id: entry.enrollment.company_id ?? null,
    step: entry.step,
    action_type: entry.actionType,
    outcome: entry.outcome,
    reasons: entry.reasons ?? [],
    detail: entry.detail ?? null,
  });
  if (error) console.error("sequence_run_log insert failed:", error.message);
}

/** Torrläge och tak loggar bara en gång per (enrollment, steg, fönster). */
async function recentlyLogged(
  enrollmentId: unknown,
  step: number,
  outcome: Outcome,
  withinMinutes: number | null,
): Promise<boolean> {
  let query = supabaseAdmin
    .from("sequence_run_log")
    .select("id")
    .eq("enrollment_id", enrollmentId)
    .eq("step", step)
    .eq("outcome", outcome)
    .limit(1);
  if (withinMinutes != null) {
    query = query.gte(
      "created_at",
      new Date(Date.now() - withinMinutes * 60_000).toISOString(),
    );
  }
  const { data } = await query;
  return (data?.length ?? 0) > 0;
}

async function sentToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("sequence_run_log")
    .select("id", { count: "exact", head: true })
    .eq("outcome", "sent")
    .gte("created_at", start.toISOString());
  return count ?? 0;
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

// --- Grinden ---

async function gateFor(enrollment: Row): Promise<{
  verdict: GateVerdict;
  email: string | null;
}> {
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, email_jsonb, company_id")
    .eq("id", enrollment.contact_id)
    .maybeSingle();
  const emailJsonb = (contact?.email_jsonb ?? null) as Array<{
    email?: string;
  }> | null;
  const email = emailJsonb?.[0]?.email ?? null;
  const companyId =
    (enrollment.company_id as number | null) ??
    (contact?.company_id as number | null) ??
    null;

  let company: Row | null = null;
  if (companyId != null) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("id, org_number, website")
      .eq("id", companyId)
      .maybeSingle();
    company = data;
  }

  const verdict = await checkGate(supabaseAdmin, {
    email,
    website: (company?.website as string | null) ?? null,
    orgNumber: (company?.org_number as string | null) ?? null,
    companyId,
  });
  return { verdict, email };
}

// --- Steg: förbereda och skicka mejl ---

const GENERIC_MAILBOXES = new Set([
  "info",
  "kontakt",
  "kontakta",
  "hej",
  "post",
  "office",
  "mail",
  "hello",
  "admin",
  "kundtjanst",
  "kundservice",
  "support",
  "bokning",
  "order",
  "sales",
]);

function isGenericMailbox(firstName: string): boolean {
  const key = firstName.trim().toLowerCase();
  return key.length === 0 || GENERIC_MAILBOXES.has(key);
}

async function prepareEmail(
  step: Row,
  enrollment: Row,
): Promise<{ ok: true; email: PreparedEmail } | { ok: false; error: string }> {
  const templateId = step.template_id as number | null;
  if (!templateId) return { ok: false, error: "No template_id on step" };

  const { data: template } = await supabaseAdmin
    .from("email_templates")
    .select("subject, body")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return { ok: false, error: "Template not found" };

  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("*")
    .eq("id", enrollment.contact_id)
    .maybeSingle();
  if (!contact) return { ok: false, error: "Contact not found" };

  const emailJsonb = contact.email_jsonb as Array<{ email: string }> | null;
  const to = emailJsonb?.[0]?.email;
  if (!to) return { ok: false, error: "Contact has no email" };

  let company: Row | null = null;
  let scan: Row | null = null;
  if (contact.company_id) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("name, website, industry, city")
      .eq("id", contact.company_id)
      .maybeSingle();
    company = data;
    // Senaste scan (vyn company_latest_scan) — ger rapportlänk och poäng
    // till mallen, så mejlet kan peka på något konkret från första raden.
    const { data: latest } = await supabaseAdmin
      .from("company_latest_scan")
      .select("total_score, report_slug, verdict")
      .eq("company_id", contact.company_id)
      .maybeSingle();
    scan = latest;
  }

  const firstName = (contact.first_name as string) || "";
  const scannerBase = (
    Deno.env.get("SCANNER_PUBLIC_URL") || "https://axona-scanner.vercel.app"
  ).replace(/\/$/, "");
  const variables: Record<string, string> = {
    first_name: firstName,
    last_name: contact.last_name || "",
    full_name: `${firstName} ${contact.last_name || ""}`.trim(),
    // Auto-skapade kontakter från companies.email heter "info"/"kontakt" —
    // då hälsar vi utan namn i stället för "Hej info".
    greeting: isGenericMailbox(firstName) ? "Hej!" : `Hej ${firstName}!`,
    email: to,
    title: contact.title || "",
    company_name: (company?.name as string) || "",
    company_website: (company?.website as string) || "",
    company_website_host: websiteHost((company?.website as string) || ""),
    company_industry: (company?.industry as string) || "",
    // "När någon i {{company_city}} söker …" — utan stad blir det "närheten".
    company_city: ((company?.city as string) || "").trim() || "närheten",
    scan_score: scan?.total_score != null ? String(scan.total_score) : "",
    scan_verdict: (scan?.verdict as string) || "",
    scan_top_issue: scanTopIssue((scan?.verdict as string) || ""),
    scan_top_issue_lower: lowerFirst(
      scanTopIssue((scan?.verdict as string) || ""),
    ),
    report_url: scan?.report_slug ? `${scannerBase}/r/${scan.report_slug}` : "",
  };
  const render = (tmpl: string) =>
    tmpl.replace(
      /\{\{(\w+)\}\}/g,
      (_m: string, key: string) => variables[key] ?? `{{${key}}}`,
    );

  return {
    ok: true,
    email: {
      to,
      subject: render(template.subject),
      body: render(template.body),
      templateId,
      companyId: (contact.company_id as number | null) ?? null,
    },
  };
}

async function sendPrepared(
  email: PreparedEmail,
  enrollment: Row,
  stepNumber: number,
): Promise<StepResult> {
  // Utkorgen går via Gmail, aldrig via Resend. Resends villkor förbjuder
  // ordagrant kall utkorg och skiljer inte på marknadsföring och
  // transaktionsmejl — ett stängt konto hade tagit offerter, avtalsmejl och
  // kundrapporter med sig. Se _shared/gmail.ts.
  const gmail = gmailConfigFromEnv((k) => Deno.env.get(k));
  if (!gmail) {
    return {
      success: false,
      error:
        "Gmail är inte konfigurerat (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, " +
        "GMAIL_REFRESH_TOKEN, GMAIL_FROM_EMAIL). Utkorgen skickas inte via Resend.",
    };
  }

  const { data: emailSend, error: insertErr } = await supabaseAdmin
    .from("email_sends")
    .insert({
      template_id: email.templateId,
      contact_id: enrollment.contact_id,
      company_id: email.companyId,
      subject: email.subject,
      body: email.body,
      to_email: email.to,
      from_email: gmail.fromEmail,
      status: "queued",
      metadata: {
        sequence_id: enrollment.sequence_id,
        sequence_step: stepNumber,
        enrollment_id: enrollment.id,
        channel: "gmail",
      },
    })
    .select()
    .single();
  if (insertErr || !emailSend) {
    return { success: false, error: "Failed to create email_sends record" };
  }

  let sent: { messageId: string; threadId: string };
  try {
    sent = await sendViaGmail(gmail, {
      to: email.to,
      subject: email.subject,
      text: email.body,
    });
  } catch (err) {
    const errText = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("email_sends")
      .update({
        status: "failed",
        metadata: { ...emailSend.metadata, gmail_error: errText },
      })
      .eq("id", emailSend.id);
    return { success: false, error: errText };
  }

  await supabaseAdmin
    .from("email_sends")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      postmark_message_id: sent.messageId,
      // Trådens id är nyckeln till svarsdetektering: kommer det ett nytt
      // meddelande i tråden som inte är vårt, har mottagaren svarat. Ingen
      // spårningspixel behövs för det, och det går inte att förfalska.
      metadata: {
        ...emailSend.metadata,
        gmail_message_id: sent.messageId,
        gmail_thread_id: sent.threadId,
      },
    })
    .eq("id", emailSend.id);
  return { success: true };
}

// --- Steg: interna åtgärder ---

async function executeCreateTask(
  step: Row,
  enrollment: Row,
  stepNumber: number,
): Promise<StepResult> {
  const config = (step.action_config || {}) as Row;
  const { error } = await supabaseAdmin.from("tasks").insert({
    contact_id: enrollment.contact_id,
    type: config.task_type || "Email",
    text: config.task_text || `Sekvens uppföljning (steg ${stepNumber})`,
    due_date: new Date(
      Date.now() + ((config.due_days as number) || 1) * 86400000,
    ).toISOString(),
    done_date: null,
  });
  if (error) {
    return { success: false, error: `Failed to create task: ${error.message}` };
  }
  return { success: true };
}

async function executeUpdateLeadStatus(
  step: Row,
  enrollment: Row,
): Promise<StepResult> {
  const config = (step.action_config || {}) as Row;
  const newStatus = config.lead_status as string;
  if (!newStatus || !enrollment.company_id) {
    return { success: false, error: "Missing lead_status or company_id" };
  }
  const { error } = await supabaseAdmin
    .from("companies")
    .update({ lead_status: newStatus })
    .eq("id", enrollment.company_id);
  if (error) {
    return {
      success: false,
      error: `Failed to update lead status: ${error.message}`,
    };
  }
  return { success: true };
}

// --- Tillståndsövergångar ---

async function advanceOrComplete(
  enrollment: Row,
  stepNumber: number,
  now: string,
): Promise<"advanced" | "completed"> {
  const { data: futureStep } = await supabaseAdmin
    .from("sequence_steps")
    .select("step_number, delay_days, delay_hours")
    .eq("sequence_id", enrollment.sequence_id)
    .eq("step_number", stepNumber + 1)
    .maybeSingle();

  if (futureStep) {
    const delayMs =
      ((futureStep.delay_days || 0) * 86400 +
        (futureStep.delay_hours || 0) * 3600) *
      1000;
    await supabaseAdmin
      .from("sequence_enrollments")
      .update({
        current_step: stepNumber,
        next_action_at: new Date(Date.now() + delayMs).toISOString(),
      })
      .eq("id", enrollment.id);
    return "advanced";
  }

  await supabaseAdmin
    .from("sequence_enrollments")
    .update({
      current_step: stepNumber,
      status: "completed",
      completed_at: now,
      next_action_at: null,
    })
    .eq("id", enrollment.id);
  return "completed";
}

async function pause(
  enrollment: Row,
  now: string,
  status: "paused" | "unsubscribed" = "paused",
): Promise<void> {
  await supabaseAdmin
    .from("sequence_enrollments")
    .update({ status, paused_at: now, next_action_at: null })
    .eq("id", enrollment.id);
}

// --- En enrollment per varv ---

interface TickCounters {
  processed: number;
  sent: number;
  executed: number;
  dryRun: number;
  suppressed: number;
  capped: number;
  completed: number;
  failed: number;
}

async function processEnrollment(
  enrollment: Row,
  settings: Settings,
  counters: TickCounters,
  now: string,
): Promise<void> {
  counters.processed += 1;
  const stepNumber = (enrollment.current_step as number) + 1;

  const { data: step } = await supabaseAdmin
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", enrollment.sequence_id)
    .eq("step_number", stepNumber)
    .maybeSingle();

  // Inga fler steg → klar. Ingen utgående effekt, men torrläget rör inget.
  if (!step) {
    if (settings.dryRun) {
      if (!(await recentlyLogged(enrollment.id, stepNumber, "dry_run", null))) {
        await logRun({
          enrollment,
          step: stepNumber,
          actionType: "complete",
          outcome: "dry_run",
          detail: { would: "complete enrollment (no more steps)" },
        });
        counters.dryRun += 1;
      }
      return;
    }
    await supabaseAdmin
      .from("sequence_enrollments")
      .update({ status: "completed", completed_at: now, next_action_at: null })
      .eq("id", enrollment.id);
    await logRun({
      enrollment,
      step: stepNumber,
      actionType: "complete",
      outcome: "completed",
    });
    counters.completed += 1;
    return;
  }

  const actionType = step.action_type as string;

  // 1. Grinden — före ALLA stegtyper. En kund ska inte heller få en
  //    uppföljningsuppgift skapad ur en kall sekvens.
  const { verdict } = await gateFor(enrollment);
  if (verdict.suppressed) {
    counters.suppressed += 1;
    if (settings.dryRun) {
      if (
        !(await recentlyLogged(
          enrollment.id,
          stepNumber,
          "skipped_suppressed",
          null,
        ))
      ) {
        await logRun({
          enrollment,
          step: stepNumber,
          actionType,
          outcome: "skipped_suppressed",
          reasons: verdict.reasons,
          detail: { would: "pause enrollment" },
        });
      }
      return;
    }
    await pause(
      enrollment,
      now,
      verdict.reasons.includes("unsubscribed") ? "unsubscribed" : "paused",
    );
    await logRun({
      enrollment,
      step: stepNumber,
      actionType,
      outcome: "skipped_suppressed",
      reasons: verdict.reasons,
    });
    return;
  }

  // 2. Dygnstak — bara för utgående mejl. Enrollment lämnas förfallen och
  //    plockas upp nästa dygn.
  if (actionType === "send_email" && !settings.dryRun) {
    const sent = await sentToday();
    if (sent >= settings.dailyCap) {
      counters.capped += 1;
      if (
        !(await recentlyLogged(
          enrollment.id,
          stepNumber,
          "skipped_cap",
          CAP_LOG_DEDUPE_MINUTES,
        ))
      ) {
        await logRun({
          enrollment,
          step: stepNumber,
          actionType,
          outcome: "skipped_cap",
          detail: { sent_today: sent, daily_cap: settings.dailyCap },
        });
      }
      return;
    }
  }

  // 3. Torrläge — rendera och logga, rör inget.
  if (settings.dryRun) {
    if (await recentlyLogged(enrollment.id, stepNumber, "dry_run", null))
      return;
    let detail: Row;
    let outcome: Outcome = "dry_run";
    if (actionType === "send_email") {
      const prepared = await prepareEmail(step, enrollment);
      if (prepared.ok) {
        detail = {
          would: "send email",
          to: prepared.email.to,
          subject: prepared.email.subject,
          body_preview: prepared.email.body.slice(0, 400),
        };
      } else {
        outcome = "failed";
        detail = { would: "send email", error: prepared.error };
      }
    } else {
      detail = { would: actionType, action_config: step.action_config ?? null };
    }
    await logRun({ enrollment, step: stepNumber, actionType, outcome, detail });
    if (outcome === "failed") counters.failed += 1;
    else counters.dryRun += 1;
    return;
  }

  // 4. Skarpt läge.
  let result: StepResult;
  switch (actionType) {
    case "send_email": {
      const prepared = await prepareEmail(step, enrollment);
      result = prepared.ok
        ? await sendPrepared(prepared.email, enrollment, stepNumber)
        : { success: false, error: prepared.error };
      break;
    }
    case "create_task":
      result = await executeCreateTask(step, enrollment, stepNumber);
      break;
    case "update_lead_status":
      result = await executeUpdateLeadStatus(step, enrollment);
      break;
    default:
      result = { success: false, error: `Unknown action: ${actionType}` };
  }

  if (!result.success) {
    await pause(enrollment, now);
    await logRun({
      enrollment,
      step: stepNumber,
      actionType,
      outcome: "failed",
      detail: { error: result.error },
    });
    counters.failed += 1;
    return;
  }

  const transition = await advanceOrComplete(enrollment, stepNumber, now);
  await logRun({
    enrollment,
    step: stepNumber,
    actionType,
    outcome: actionType === "send_email" ? "sent" : "executed",
    detail: { transition },
  });
  if (actionType === "send_email") counters.sent += 1;
  else counters.executed += 1;
  if (transition === "completed") counters.completed += 1;
}

// --- Main ---

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
    const settings = await loadSettings();
    // pg_cron-wrappern skapar en mc_runs-rad och skickar id:t hit, så
    // Mission Control kan visa utfallet per körning — inte bara heartbeatet.
    const body = (await req
      .clone()
      .json()
      .catch(() => null)) as Row | null;
    const mcRunId =
      body && typeof body.mc_run_id === "number" ? body.mc_run_id : null;
    const finishRun = async (
      status: "succeeded" | "failed",
      summary: string,
    ) => {
      if (mcRunId == null) return;
      const { error } = await supabaseAdmin
        .from("mc_runs")
        .update({
          status,
          finished_at: new Date().toISOString(),
          summary: summary.slice(0, 500),
          error: status === "failed" ? summary.slice(0, 500) : null,
        })
        .eq("id", mcRunId);
      if (error) console.error("mc_runs update failed:", error.message);
    };
    const counters: TickCounters = {
      processed: 0,
      sent: 0,
      executed: 0,
      dryRun: 0,
      suppressed: 0,
      capped: 0,
      completed: 0,
      failed: 0,
    };

    try {
      const { data: due, error: fetchErr } = await supabaseAdmin
        .from("sequence_enrollments")
        .select("*, sequences!inner(status)")
        .eq("status", "active")
        .lte("next_action_at", startedAt)
        .eq("sequences.status", "active")
        .order("next_action_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (fetchErr) {
        await heartbeat("failed", startedAt, `fetch: ${fetchErr.message}`, {
          settings,
        });
        await finishRun("failed", `fetch: ${fetchErr.message}`);
        return createErrorResponse(500, "Failed to fetch enrollments");
      }

      for (const enrollment of due ?? []) {
        try {
          await processEnrollment(enrollment, settings, counters, startedAt);
        } catch (err) {
          counters.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          console.error(`enrollment ${enrollment.id} failed:`, message);
          await logRun({
            enrollment,
            step: (enrollment.current_step as number) + 1,
            actionType: null,
            outcome: "failed",
            detail: { error: message },
          });
        }
      }

      const mode = settings.dryRun ? "TORRLÄGE" : "skarpt";
      const summary = `${mode}: ${counters.processed} förfallna, ${counters.sent} skickade, ${counters.suppressed} spärrade, ${counters.dryRun} torrkörda`;
      await heartbeat("ok", startedAt, summary, { ...counters, settings });
      await finishRun(counters.failed > 0 ? "failed" : "succeeded", summary);
      return createJsonResponse({ mode, ...counters });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("process_sequences error:", error);
      await heartbeat("failed", startedAt, message, { ...counters, settings });
      await finishRun("failed", message);
      return createErrorResponse(500, `Failed: ${message}`);
    }
  }),
);
