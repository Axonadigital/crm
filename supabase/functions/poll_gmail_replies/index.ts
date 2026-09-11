import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { gmailConfigFromEnv, getAccessToken } from "../_shared/gmail.ts";
import {
  bounceSeverity,
  bouncedRecipient,
  classifyMessage,
  decodePlainText,
  fetchProfile,
  fetchThread,
  headerValue,
  isNegativeReply,
  parseAddress,
  shouldSuppressOnBounce,
  type GmailApiMessage,
} from "../_shared/gmailRead.ts";

/**
 * Svarsläsaren — läser utfallet av den kalla utkorgen ur Gmail-tråden.
 *
 * Anropas var 10:e minut av pg_cron via public.run_poll_gmail_replies()
 * (migration 20260910140000).
 *
 * Vi skickar utkorgen via Gmail-API:t och sparar trådens id på varje utskick.
 * Allt som sedan händer med mejlet hamnar i samma tråd, så en enda
 * threads.get per utskick ger oss svar, frånvaromejl och studsar utan
 * spårningspixel och utan plattformswebhook.
 *
 * Vad varje utfall gör:
 *   svar          → pausar sekvensen, lägger en uppgift till en människa
 *   tydligt nej   → pausar OCH spärrar bolaget i grinden (19 § MFL)
 *   studs         → spärrar adressen, markerar utskicket, pausar sekvensen
 *   frånvaromejl  → loggas bara; det är varken ett svar eller ett fel
 *
 * Spammarkeringar går inte att läsa här. Ingen avsändare får dem per
 * mottagare — den siffran finns bara aggregerat i Google Postmaster Tools.
 *
 * Auth: x-cron-secret (ingen användarkontext).
 * Kräver scopet gmail.readonly utöver gmail.send.
 */

const JOB_NAME = "poll-gmail-replies";
/** Trådar per körning. En threads.get tar ~200 ms, så 40 ryms väl. */
const BATCH_SIZE = 40;
/** Efter en månad slutar vi kolla — inget svar kommer så sent. */
const MAX_AGE_DAYS = 30;
const TIME_BUDGET_MS = 100_000;

type Row = Record<string, unknown>;

interface Counters {
  threads: number;
  replies: number;
  /** Permanenta studsar — de enda som spärrar en adress. */
  bounces: number;
  /** Tillfälliga studsar: full brevlåda, upptagen server, greylisting. */
  softBounces: number;
  /** Studsar vi inte kunde bedöma. Spärrar inget, lägger en uppgift. */
  unknownBounces: number;
  autoReplies: number;
  saidNo: number;
  failed: number;
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
 * Adresser som är våra egna, så vi inte läser vårt eget utskick som ett svar.
 *
 * Tre källor, och alla tre behövs. Avsändaradressen är aliaset vi skickar
 * från (rasmus@axonadigital.com). Brevlådan är kontot aliaset sitter på
 * (info@axonadigital.se) — svarar Isak eller jag från info@ inne i tråden
 * är det inte kunden som hört av sig, och utan den här raden hade det
 * pausat sekvensen och lagt en falsk uppgift. GMAIL_OUR_ADDRESSES är till
 * för resten av våra adresser den dagen vi har fler.
 */
function ourAddresses(fromEmail: string, mailbox: string): string[] {
  const extra = (Deno.env.get("GMAIL_OUR_ADDRESSES") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [
    ...new Set(
      [fromEmail, mailbox, ...extra]
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/** Spärrar en adress i grinden. Tyst om raden redan finns. */
async function suppress(
  email: string | null,
  companyId: number | null,
  reason: "bounced" | "said_no",
  note: string,
): Promise<void> {
  if (!email && companyId == null) return;
  const { data: existing } = await supabaseAdmin
    .from("outreach_suppressions")
    .select("id")
    .eq("reason", reason)
    .eq(email ? "email" : "company_id", email ?? companyId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabaseAdmin.from("outreach_suppressions").insert({
    email,
    company_id: companyId,
    reason,
    source: "gmail_inbound",
    note: note.slice(0, 500),
  });
  if (error) console.error("suppression insert failed:", error.message);
}

/** Pausar enrollmenten. next_action_at nollas så motorn aldrig plockar den igen. */
async function stopEnrollment(
  enrollmentId: number | null,
  status: "replied" | "bounced" | "unsubscribed",
): Promise<void> {
  if (enrollmentId == null) return;
  const { error } = await supabaseAdmin
    .from("sequence_enrollments")
    .update({
      status,
      paused_at: new Date().toISOString(),
      next_action_at: null,
    })
    .eq("id", enrollmentId)
    .eq("status", "active");
  if (error) console.error("enrollment stop failed:", error.message);
}

/**
 * En uppgift till en människa. Ett svar på ett kallt mejl är det enda
 * tillfället i hela kedjan där en robot inte ska ta nästa steg.
 */
async function createReplyTask(
  send: Row,
  fromEmail: string | null,
  snippet: string,
  negative: boolean,
): Promise<void> {
  const who = fromEmail ?? (send.to_email as string) ?? "okänd avsändare";
  const text = negative
    ? `NEJ från ${who} — spärrad automatiskt. Läs och bekräfta: "${snippet.slice(0, 180)}"`
    : `SVAR från ${who} på "${send.subject}". Svara idag: "${snippet.slice(0, 180)}"`;
  const { error } = await supabaseAdmin.from("tasks").insert({
    contact_id: send.contact_id,
    type: "Email",
    text,
    // Samma dag. Ett svar som ligger obesvarat i två dygn är ett tappat lead.
    due_date: new Date().toISOString(),
    done_date: null,
  });
  if (error) console.error("reply task insert failed:", error.message);
}

/**
 * Uppgift för en studs vi inte kunde bedöma. Vi spärrar INTE automatiskt —
 * en felaktig spärr är tyst och permanent — utan låter en människa avgöra.
 */
async function createBounceReviewTask(
  send: Row,
  subject: string,
  severity: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from("tasks").insert({
    contact_id: send.contact_id,
    type: "Email",
    text:
      `Studs som inte gick att bedöma (${severity}) till ${send.to_email} ` +
      `på "${send.subject}". Ämne på studsen: "${subject.slice(0, 120)}". ` +
      `Adressen är INTE spärrad — kolla om den är död och spärra manuellt.`,
    due_date: new Date(Date.now() + 86_400_000).toISOString(),
    done_date: null,
  });
  if (error) console.error("bounce review task insert failed:", error.message);
}

/** Behandlar ett inkommande meddelande. Returnerar false om det redan var läst. */
async function handleIncoming(
  send: Row,
  message: GmailApiMessage,
  kind: "reply" | "bounce" | "auto_reply",
  counters: Counters,
): Promise<void> {
  const metadata = (send.metadata || {}) as Row;
  const enrollmentId =
    typeof metadata.enrollment_id === "number" ? metadata.enrollment_id : null;
  const companyId = (send.company_id as number | null) ?? null;
  const fromEmail = parseAddress(headerValue(message.payload, "From"));
  const subject = headerValue(message.payload, "Subject");
  const bodyText = decodePlainText(message.payload) || (message.snippet ?? "");
  const negative = kind === "reply" && isNegativeReply(bodyText);
  // Räknas en gång och används både på inkorgsraden och i beslutet nedan.
  const severity = kind === "bounce" ? bounceSeverity(message) : null;
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();

  // Unikt index på gmail_message_id gör insert till dubblettskyddet: samma
  // meddelande kan aldrig pausa en sekvens två gånger, hur ofta vi än pollar.
  const { error: insertErr } = await supabaseAdmin
    .from("outreach_inbound")
    .insert({
      email_send_id: send.id,
      enrollment_id: enrollmentId,
      company_id: companyId,
      contact_id: send.contact_id,
      gmail_thread_id: send.gmail_thread_id,
      gmail_message_id: message.id,
      kind,
      from_email: fromEmail,
      subject: subject.slice(0, 500),
      snippet: bodyText.slice(0, 2000),
      sentiment: negative ? "negative" : "unknown",
      bounce_severity: severity,
      received_at: receivedAt,
    });
  if (insertErr) {
    if (insertErr.code !== "23505") {
      console.error("outreach_inbound insert failed:", insertErr.message);
      counters.failed += 1;
      return;
    }
    // 23505 = meddelandet är redan behandlat. Normalt för en tråd vi pollar
    // om och om igen. Men ett steg-2-utskick delar tråd med steg 1, så det
    // andra utskicket måste ändå få sin status — annars ligger det kvar i
    // pollningskön i trettio dagar och ser obesvarat ut i statistiken.
    if (kind === "reply") {
      await supabaseAdmin
        .from("email_sends")
        .update({ status: "replied", replied_at: receivedAt })
        .eq("id", send.id)
        .is("replied_at", null);
    } else if (kind === "bounce" && shouldSuppressOnBounce(severity!)) {
      // Bara permanenta studsar markerar utskicket som studsat. En
      // fördröjningsnotis ska INTE plocka bort tråden ur bevakningen —
      // mejlet kan fortfarande komma fram, och svaret med det.
      await supabaseAdmin
        .from("email_sends")
        .update({ status: "bounced", bounced_at: receivedAt })
        .eq("id", send.id)
        .is("bounced_at", null);
    }
    // Uppgiften och spärren skapades av det första utskicket. Att göra om dem
    // hade gett Rasmus två identiska uppgifter för samma svar.
    return;
  }

  if (kind === "auto_reply") {
    counters.autoReplies += 1;
    return;
  }

  if (kind === "bounce") {
    // Allvarlighetsgraden avgör allt. Fram till 2026-09-11 spärrades
    // adressen vid VARJE delivery-status-rapport, alltså även vid en ren
    // fördröjningsnotis ("Delivery Status Notification (Delay)",
    // Status 4.4.7). Spärren är enkelriktad och tyst, så ett fungerande
    // företag hade försvunnit ur utkorgen utan att någon märkte det.
    if (severity === "receipt") {
      // Leveranskvittens med DSN-struktur. Ingen studs alls.
      counters.autoReplies += 1;
      return;
    }

    if (!shouldSuppressOnBounce(severity!)) {
      if (severity === "soft") {
        counters.softBounces += 1;
      } else {
        counters.unknownBounces += 1;
        // Obestämbar studs: ingen spärr, men en människa får titta.
        await createBounceReviewTask(send, subject, severity ?? "unknown");
      }
      // Varken utskicket eller sekvensen rörs — tråden bevakas vidare, och
      // nästa försök visar om det var tillfälligt.
      return;
    }

    counters.bounces += 1;
    const dead = bouncedRecipient(message) ?? (send.to_email as string | null);
    await supabaseAdmin
      .from("email_sends")
      .update({ status: "bounced", bounced_at: receivedAt })
      .eq("id", send.id);
    await suppress(
      dead,
      companyId,
      "bounced",
      `Permanent studs från Gmail ${receivedAt}: ${subject}`,
    );
    await stopEnrollment(enrollmentId, "bounced");
    return;
  }

  counters.replies += 1;
  await supabaseAdmin
    .from("email_sends")
    .update({ status: "replied", replied_at: receivedAt })
    .eq("id", send.id);
  if (negative) {
    counters.saidNo += 1;
    await suppress(
      fromEmail ?? (send.to_email as string | null),
      companyId,
      "said_no",
      `Nej i svar ${receivedAt}: ${bodyText.slice(0, 300)}`,
    );
    await stopEnrollment(enrollmentId, "unsubscribed");
  } else {
    await stopEnrollment(enrollmentId, "replied");
  }
  await createReplyTask(send, fromEmail, bodyText, negative);
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

    const counters: Counters = {
      threads: 0,
      replies: 0,
      bounces: 0,
      softBounces: 0,
      unknownBounces: 0,
      autoReplies: 0,
      saidNo: 0,
      failed: 0,
    };

    const gmail = gmailConfigFromEnv((k) => Deno.env.get(k));
    if (!gmail) {
      const msg = "Gmail är inte konfigurerat — ingen svarsläsning möjlig.";
      await heartbeat("failed", startedAt, msg, {});
      await finishRun("failed", msg);
      return createErrorResponse(500, msg);
    }

    try {
      let accessToken: string;
      try {
        accessToken = await getAccessToken(gmail);
      } catch (err) {
        // Vanligast: refresh-token saknar gmail.readonly. Säg det rakt ut i
        // stället för att låta jobbet se ut att fungera.
        const msg =
          err instanceof Error ? err.message : "Gmail-token kunde inte hämtas";
        await heartbeat("failed", startedAt, msg, {});
        await finishRun("failed", msg);
        return createErrorResponse(500, msg);
      }

      // Hälsokoll före urvalet: går profilen igenom har vi läsrättighet.
      // Utan den hade en körning utan trådar sett grön ut även om scopet
      // saknades, och vi hade upptäckt det först vid första riktiga svaret.
      let mailbox = "";
      try {
        const profile = await fetchProfile(accessToken);
        mailbox = profile.emailAddress;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await heartbeat("failed", startedAt, msg, {});
        await finishRun("failed", msg);
        return createErrorResponse(500, msg);
      }

      const cutoff = new Date(
        Date.now() - MAX_AGE_DAYS * 86400000,
      ).toISOString();
      const { data: sends, error: fetchErr } = await supabaseAdmin
        .from("email_sends")
        .select(
          "id, to_email, subject, contact_id, company_id, metadata, gmail_thread_id",
        )
        .not("gmail_thread_id", "is", null)
        .is("replied_at", null)
        .is("bounced_at", null)
        .gt("sent_at", cutoff)
        .order("thread_checked_at", { ascending: true, nullsFirst: true })
        .limit(BATCH_SIZE);

      if (fetchErr) {
        await heartbeat("failed", startedAt, `fetch: ${fetchErr.message}`, {});
        await finishRun("failed", `fetch: ${fetchErr.message}`);
        return createErrorResponse(500, "Failed to fetch sends");
      }

      const ours = ourAddresses(gmail.fromEmail, mailbox);

      for (const send of sends ?? []) {
        if (Date.now() > deadline) break;
        counters.threads += 1;
        try {
          const thread = await fetchThread(
            accessToken,
            send.gmail_thread_id as string,
          );
          for (const message of thread?.messages ?? []) {
            const kind = classifyMessage(message, ours);
            if (kind === "ours") continue;
            await handleIncoming(send, message, kind, counters);
          }
        } catch (err) {
          counters.failed += 1;
          console.error(
            `tråd ${send.gmail_thread_id} misslyckades:`,
            err instanceof Error ? err.message : String(err),
          );
        }
        // Alltid, även vid fel — annars fastnar samma trasiga tråd överst i
        // kön och blockerar alla andra för evigt.
        await supabaseAdmin
          .from("email_sends")
          .update({ thread_checked_at: new Date().toISOString() })
          .eq("id", send.id);
      }

      const summary =
        `${counters.threads} trådar · ${counters.replies} svar ` +
        `(${counters.saidNo} nej) · ${counters.bounces} permanenta studsar ` +
        `(spärrade) · ${counters.softBounces} tillfälliga · ` +
        `${counters.unknownBounces} obedömda · ` +
        `${counters.autoReplies} frånvaro`;
      await heartbeat("ok", startedAt, summary, { ...counters, mailbox });
      await finishRun(counters.failed > 0 ? "failed" : "succeeded", summary);
      return createJsonResponse({ ...counters });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("poll_gmail_replies error:", error);
      await heartbeat("failed", startedAt, message, { ...counters });
      await finishRun("failed", message);
      return createErrorResponse(500, `Failed: ${message}`);
    }
  }),
);
