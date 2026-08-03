import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  errorResponseFromUnknown,
  getOptionalBooleanField,
  getPositiveIntegerField,
  parseRequiredJsonBody,
} from "../_shared/http.ts";
import {
  DEFAULT_UPSELL_CATALOG,
  selectUpsells,
} from "../_shared/monthlyReport/upsellCatalog.ts";
import { buildMonthlyReportPrompts } from "../_shared/monthlyReport/buildReportPrompt.ts";
import { generateReportContent } from "../_shared/monthlyReport/generateReportContent.ts";
import {
  buildReportEmailHtml,
  CUSTOMER_HIDDEN_FINDING_KEYS,
} from "../_shared/monthlyReport/buildReportEmailHtml.ts";
import { notifyReportDiscord } from "../_shared/monthlyReport/notifyReportDiscord.ts";
import type {
  ReportSnapshot,
  UpsellOffer,
} from "../_shared/monthlyReport/types.ts";
import {
  buildFallbackReportContent,
  buildReportViewModel,
} from "../_shared/monthlyReport/reportViewModel.ts";
import { buildPresentationPolicy } from "../_shared/monthlyReport/reportPresentation.ts";
import { buildReportPdf } from "../_shared/monthlyReport/buildReportPdf.ts";
import { previousCalendarMonth } from "../_shared/visibilityPeriods.ts";
import { aggregateSearchConsole } from "../_shared/monthlyReport/aggregateSnapshots.ts";

/**
 * Generate Monthly Reports — skapar en DRAFT-månadsrapport per kund (godkännande-
 * grind: mailet skickas av send_monthly_report först efter godkännande).
 *
 * Lägen (samma dubbla auth som analyze_website):
 *   { cron: true }   — [LEGACY, ej längre schemalagd] alla kunder i en enda
 *                      körning. Bytt ut mot tick-läget nedan.
 *   { tick: true }   — plocka upp ett litet antal `pending`-rader ur
 *                      report_pipeline_queue (stage='report', dvs vars
 *                      snapshot redan är klar) och generera draft. Anropas
 *                      var 5:e minut av pg_cron (run_pipeline_tick('report')).
 *   { company_id }   — en kund (knappen på Kund-fliken, user-JWT)
 */

const CRON_BATCH_SIZE = 3;

// --- Helpers ---

function monthLabelSv(periodISO: string): string {
  return new Date(`${periodISO}T00:00:00Z`).toLocaleDateString("sv-SE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SNAPSHOT_COLUMNS =
  "id, fetched_at, period_start, period_end, window_kind, data_coverage, source_status, performance_score, seo_score, pagespeed, field_data, seo_checks, business_profile, search_console, findings";

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

function monthFirst(periodISO: string): string {
  const d = new Date(`${periodISO}T00:00:00Z`);
  return isoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}
function monthLast(periodISO: string): string {
  const d = new Date(`${periodISO}T00:00:00Z`);
  return isoDate(
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
  );
}
function monthCount(startISO: string, endISO: string): number {
  const s = new Date(`${startISO}T00:00:00Z`);
  const e = new Date(`${endISO}T00:00:00Z`);
  return (
    (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (e.getUTCMonth() - s.getUTCMonth()) +
    1
  );
}
/** Föregående lika långa månadsintervall (för trend-jämförelsen). */
function precedingRange(
  startISO: string,
  months: number,
): { startDate: string; endDate: string } {
  const s = new Date(`${startISO}T00:00:00Z`);
  const endPrev = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 0));
  const startPrev = new Date(
    Date.UTC(endPrev.getUTCFullYear(), endPrev.getUTCMonth() - (months - 1), 1),
  );
  return { startDate: isoDate(startPrev), endDate: isoDate(endPrev) };
}
function periodLabelSv(startISO: string, endISO: string): string {
  return monthFirst(startISO) === monthFirst(endISO)
    ? monthLabelSv(startISO)
    : `${monthLabelSv(startISO)} – ${monthLabelSv(endISO)}`;
}

async function loadMonthSnapshots(
  companyId: number,
  startDate: string,
  endDate: string,
): Promise<ReportSnapshot[]> {
  const { data } = await supabaseAdmin
    .from("website_snapshots")
    .select(SNAPSHOT_COLUMNS)
    .eq("company_id", companyId)
    .eq("window_kind", "calendar_month")
    .gte("period_start", startDate)
    .lte("period_start", endDate)
    .order("period_start", { ascending: true });
  return (data ?? []) as ReportSnapshot[];
}

/**
 * Slår ihop flera månads-snapshots till en syntetisk ReportSnapshot för
 * perioden: GSC aggregeras (B1), medan prestanda/SEO/Business tas från den
 * SENASTE månaden (ögonblicksdata som inte kan historiseras).
 */
function aggregateReportSnapshot(
  snaps: ReportSnapshot[],
  range: { startDate: string; endDate: string },
): ReportSnapshot | null {
  if (snaps.length === 0) return null;
  const sorted = [...snaps].sort((a, b) =>
    (a.period_start ?? "").localeCompare(b.period_start ?? ""),
  );
  const mostRecent = sorted[sorted.length - 1];
  const agg = aggregateSearchConsole(
    sorted.map((s) => s.search_console ?? null),
  );
  return {
    ...mostRecent,
    period_start: range.startDate,
    period_end: range.endDate,
    search_console: (agg ??
      mostRecent.search_console) as ReportSnapshot["search_console"],
  };
}

/** Kundvänd rad om GEO/AI-sök-beredskap ur crawl-data. llms.txt nämns ej. */
function geoReadiness(seoChecks: ReportSnapshot["seo_checks"]): string {
  if (!seoChecks) return "Kunde inte kontrolleras den här perioden.";
  return seoChecks.schema_org
    ? "Strukturerad data finns — bra grund för att AI-tjänster ska förstå er."
    : "Strukturerad data saknas — försvårar för AI-tjänster att förstå och rekommendera er.";
}

async function loadUpsellCatalog(): Promise<UpsellOffer[]> {
  try {
    const { data } = await supabaseAdmin
      .from("configuration")
      .select("config")
      .eq("id", 1)
      .single();
    const catalog = data?.config?.monthlyReport?.upsellCatalog;
    if (Array.isArray(catalog) && catalog.length > 0) {
      return catalog as UpsellOffer[];
    }
  } catch (error) {
    console.warn(
      "generate_monthly_reports: config read failed, using default:",
      error,
    );
  }
  return DEFAULT_UPSELL_CATALOG;
}

/** Primär mottagare: äldsta kontakten med Work-mail, annars första mailet. */
async function resolveRecipient(
  companyId: number,
): Promise<{ email: string | null; name: string | null }> {
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("first_name, last_name, email_jsonb, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (!contacts || contacts.length === 0) return { email: null, name: null };

  type C = {
    first_name?: string | null;
    last_name?: string | null;
    email_jsonb?: Array<{ email: string; type: string }> | null;
  };
  const nameOf = (c: C) =>
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null;

  for (const contact of contacts as C[]) {
    const work = (contact.email_jsonb ?? []).find((e) => e.type === "Work");
    if (work?.email) return { email: work.email, name: nameOf(contact) };
  }
  for (const contact of contacts as C[]) {
    const any = (contact.email_jsonb ?? [])[0];
    if (any?.email) return { email: any.email, name: nameOf(contact) };
  }
  return { email: null, name: null };
}

// --- Kärna: skapa draft för ett företag ---

async function generateReportForCompany(
  companyId: number,
  source: "manual" | "cron",
  requestedPeriod?: { startDate: string; endDate: string },
  /**
   * Tillåter manuell omgenerering av en period som redan har status
   * sent/approved (t.ex. skicka om med en nu fullständig månad). Sätts bara
   * av en explicit, autentiserad CRM-handling — cron skickar aldrig denna.
   */
  force = false,
  recommendedService?: string,
): Promise<{ report_id: number | null; status: string }> {
  // Period: vald (normaliserad till hela månader) eller default = förra månaden.
  const reportPeriod = requestedPeriod
    ? {
        startDate: monthFirst(requestedPeriod.startDate),
        endDate: monthLast(requestedPeriod.endDate),
      }
    : (() => {
        const m = previousCalendarMonth();
        return { startDate: m.startDate, endDate: m.endDate };
      })();
  const months = monthCount(reportPeriod.startDate, reportPeriod.endDate);
  const comparisonPeriod = precedingRange(reportPeriod.startDate, months);
  const period = reportPeriod.startDate;
  const periodLabel = periodLabelSv(
    reportPeriod.startDate,
    reportPeriod.endDate,
  );

  // Idempotens per distinkt period (start+slut). Färdig rapport rörs aldrig.
  const { data: existing } = await supabaseAdmin
    .from("monthly_reports")
    .select("id, status")
    .eq("company_id", companyId)
    .eq("data_period_start", reportPeriod.startDate)
    .eq("data_period_end", reportPeriod.endDate)
    .maybeSingle();
  if (
    existing &&
    (existing.status === "sent" || existing.status === "approved") &&
    !force
  ) {
    return { report_id: existing.id, status: "skipped_already_finalized" };
  }

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .single();
  if (!company) throw new Error(`Company ${companyId} not found`);

  // Endast officiella kalendermånad-snapshots är giltiga rapportunderlag.
  // Flera månader aggregeras (B1); jämförelsen är föregående lika långa period.
  const [rangeSnaps, comparisonSnaps] = await Promise.all([
    loadMonthSnapshots(companyId, reportPeriod.startDate, reportPeriod.endDate),
    loadMonthSnapshots(
      companyId,
      comparisonPeriod.startDate,
      comparisonPeriod.endDate,
    ),
  ]);
  const latest = aggregateReportSnapshot(rangeSnaps, reportPeriod);
  const previous = aggregateReportSnapshot(comparisonSnaps, comparisonPeriod);

  // Täckning: hur många av de begärda månaderna hade faktiskt en snapshot.
  // Skiljer "hela perioden summerad" från "bara delar av den" (t.ex. saknad
  // historik före pipelinen gick live) — se periodCoverage på ReportViewModel.
  const periodCoverage = {
    monthsRequested: months,
    monthsFound: rangeSnaps.length,
    complete: rangeSnaps.length >= months,
  };
  const monthlySeries = rangeSnaps
    .filter((s) => s.search_console)
    .map((s) => ({
      month: (s.period_start ?? "").slice(0, 7),
      clicks: s.search_console!.clicks,
      impressions: s.search_console!.impressions,
    }));

  const writeRow = async (fields: Record<string, unknown>) => {
    if (existing) {
      const { data, error } = await supabaseAdmin
        .from("monthly_reports")
        .update(fields)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw new Error(`update monthly_reports: ${error.message}`);
      return data!.id as number;
    }
    const { data, error } = await supabaseAdmin
      .from("monthly_reports")
      .insert({
        company_id: companyId,
        period,
        // Alltid satt (även skip-vägen) så idempotens-kollen matchar och cron
        // inte ackumulerar dubbletter för kunder utan snapshot.
        data_period_start: reportPeriod.startDate,
        data_period_end: reportPeriod.endDate,
        ...fields,
      })
      .select("id")
      .single();
    if (error) throw new Error(`insert monthly_reports: ${error.message}`);
    return data!.id as number;
  };

  if (!latest) {
    const id = await writeRow({ status: "skipped", error: "no snapshot" });
    return { report_id: id, status: "skipped_no_snapshot" };
  }

  const recipient = await resolveRecipient(companyId);
  const viewModel = buildReportViewModel({
    companyName: company.name,
    periodLabel,
    latest,
    previous,
  });
  // rangeSnaps-härledd data som den rena buildReportViewModel (latest/previous
  // only) inte kan bygga själv — tilldelas post-hoc, samma mönster som
  // presentation nedan.
  viewModel.periodCoverage = periodCoverage;
  viewModel.metrics.monthlySeries = monthlySeries;
  // Auto-policy: vad som är presentabelt + ton. Lagras inuti view_model så den
  // följer med till send (single source of truth för rendering).
  const presentation = buildPresentationPolicy(viewModel);
  viewModel.presentation = presentation;
  const metrics = viewModel.metrics;
  const catalog = await loadUpsellCatalog();
  const upsells = selectUpsells(
    latest.findings,
    catalog,
    CUSTOMER_HIDDEN_FINDING_KEYS,
  );
  const selectedUpsell =
    (recommendedService
      ? (upsells.find((offer) => offer.service === recommendedService) ??
        catalog.find((offer) => offer.service === recommendedService))
      : null) ??
    upsells[0] ??
    null;
  const reportUpsells =
    selectedUpsell &&
    !upsells.some((offer) => offer.service === selectedUpsell.service)
      ? [selectedUpsell, ...upsells]
      : upsells;
  const hasSearchData = !!latest.search_console;
  // Flermånadersperioder jämförs mot en lika lång föregående period, inte
  // "förra månaden" — annars skriver AI:n att t.ex. en juni–juli-rapport
  // jämfördes mot juni, trots att comparisonPeriod faktiskt är april–maj.
  const comparisonLabel =
    months === 1
      ? "förra månaden"
      : `perioden innan (${periodLabelSv(comparisonPeriod.startDate, comparisonPeriod.endDate)})`;

  const { prompt, systemPrompt } = buildMonthlyReportPrompts({
    companyName: company.name,
    contactName: recipient.name,
    periodLabel,
    metrics,
    upsell: selectedUpsell,
    recommendations: viewModel.recommendations,
    geoReadiness: geoReadiness(latest.seo_checks),
    hasSearchData,
    presentation,
    comparisonLabel,
  });

  let content = buildFallbackReportContent(viewModel, recipient.name);
  let aiFallbackReason: string | null = null;
  let usedGeneratedContent = false;
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (apiKey) {
    try {
      const result = await generateReportContent({
        prompt,
        systemPrompt,
        apiKey,
        validation: {
          supabase: supabaseAdmin,
          notifyDiscord: async ({ validationError }) => {
            await notifyReportDiscord({
              title: "Månadsrapport: AI-text underkänd",
              description: `**Kund:** ${company.name}\n**Fel:** ${validationError}`,
              color: 15105570,
            });
          },
        },
      });
      if (result.content) {
        content = result.content;
        usedGeneratedContent = true;
      } else {
        aiFallbackReason = "AI-svaret klarade inte valideringen";
      }
    } catch (aiError) {
      aiFallbackReason =
        aiError instanceof Error ? aiError.message : String(aiError);
    }
  } else {
    aiFallbackReason = "ANTHROPIC_API_KEY saknas";
  }
  if (selectedUpsell) {
    content = {
      ...content,
      recommended_service: selectedUpsell.service,
      recommended_action: usedGeneratedContent
        ? content.recommended_action
        : selectedUpsell.description,
      upsell_pitch: usedGeneratedContent
        ? content.upsell_pitch
        : selectedUpsell.pitch,
    };
  }

  const html = buildReportEmailHtml({
    companyName: company.name,
    periodLabel,
    aiContent: content,
    metrics,
    viewModel,
    hasSearchData,
    presentation,
    replyToEmail: Deno.env.get("RESEND_FROM_EMAIL") || "hej@axonadigital.se",
    bookingUrl: Deno.env.get("MONTHLY_REPORT_BOOKING_URL") || undefined,
  });
  const pdfBytes = await buildReportPdf({
    viewModel,
    aiContent: content,
    presentation,
  });
  const pdfPath = `${companyId}/${reportPeriod.startDate}_${reportPeriod.endDate}/synlighetsrapport-v2.pdf`;
  const { error: pdfUploadError } = await supabaseAdmin.storage
    .from("monthly-reports")
    .upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (pdfUploadError) {
    throw new Error(`PDF upload failed: ${pdfUploadError.message}`);
  }

  const reportId = await writeRow({
    status: "draft",
    snapshot_id: latest.id ?? null,
    previous_snapshot_id: previous?.id ?? null,
    recipient_email: recipient.email,
    recipient_name: recipient.name,
    ai_content: content,
    selected_upsells: reportUpsells,
    metrics,
    view_model: viewModel,
    generated_html: html,
    data_period_start: reportPeriod.startDate,
    data_period_end: reportPeriod.endDate,
    report_version: 2,
    pdf_storage_path: pdfPath,
    pdf_generated_at: new Date().toISOString(),
    error: aiFallbackReason
      ? `AI-reservtext användes: ${aiFallbackReason}`
      : null,
  });

  // Discord-grind: "Granska & skicka" → CRM:t. Varningsfärg vid negativ huvudtrend.
  const crmUrl =
    Deno.env.get("CRM_PUBLIC_URL") ||
    Deno.env.get("SITE_URL") ||
    "http://localhost:5173";
  const clicksDelta = metrics.clicks.deltaPct;
  const negative = clicksDelta != null && clicksDelta < 0;
  const recipientLine = recipient.email
    ? recipient.email
    : "⚠️ ingen kontakt-email hittad";

  await notifyReportDiscord(
    {
      title: `Månadsrapport redo: ${company.name}`,
      description:
        `**Period:** ${periodLabel}\n` +
        `**Mottagare:** ${recipientLine}\n` +
        `**Föreslagen upsell:** ${selectedUpsell?.label ?? "ingen"}\n` +
        (aiFallbackReason
          ? `ℹ️ **Reservtext användes:** ${aiFallbackReason.slice(0, 120)}\n`
          : "") +
        (negative
          ? `⚠️ **Klick ned ${Math.round(clicksDelta!)}% mot förra månaden — granska tonen.**`
          : ""),
      color: negative ? 15105570 : 3066993, // amber vid negativ trend, annars grön
    },
    [
      {
        label: "Granska & skicka i CRM",
        url: `${crmUrl}/#/companies/${companyId}/show`,
      },
    ],
  );

  return {
    report_id: reportId,
    status: source === "cron" ? "draft_cron" : "draft",
  };
}

// --- Cron-svep ---

async function runCronSweep(): Promise<void> {
  const { data: customers, error } = await supabaseAdmin
    .from("customer_details")
    .select("company_id")
    .not("delivered_website_url", "is", null);
  if (error || !customers) {
    console.error(
      "generate_monthly_reports cron: could not list customers",
      error,
    );
    return;
  }
  console.warn(`generate_monthly_reports cron: ${customers.length} customers`);
  for (let i = 0; i < customers.length; i += CRON_BATCH_SIZE) {
    const batch = customers.slice(i, i + CRON_BATCH_SIZE);
    await Promise.all(
      batch.map((row) =>
        generateReportForCompany(row.company_id, "cron").catch((err) =>
          console.error(
            `generate_monthly_reports cron: company ${row.company_id} failed:`,
            err,
          ),
        ),
      ),
    );
  }
  console.warn("generate_monthly_reports cron: sweep complete");
}

// --- Tick-läge: plocka N rader ur report_pipeline_queue (stage='report') ---

type PipelineQueueRow = {
  id: number;
  company_id: number;
  period_start: string;
  period_end: string;
  claimed_at: string;
};

async function runQueueTick(batchSize: number): Promise<void> {
  const { data: claimed, error } = await supabaseAdmin.rpc(
    "claim_pipeline_queue_batch",
    { p_stage: "report", p_batch_size: batchSize },
  );
  if (error) {
    console.error(
      "generate_monthly_reports tick: could not claim queue batch",
      error,
    );
    return;
  }
  const rows = (claimed ?? []) as PipelineQueueRow[];
  if (rows.length === 0) return;

  console.warn(
    `generate_monthly_reports tick: processing ${rows.length} customers`,
  );
  await Promise.all(
    rows.map(async (row) => {
      try {
        const result = await generateReportForCompany(row.company_id, "cron", {
          startDate: row.period_start,
          endDate: row.period_end,
        });
        // Kön skapar bara report-rader efter att snapshot-steget lyckats, så
        // "no snapshot" här är en anomali (inte det förväntade race-condition-
        // fallet från den gamla designen) — flagga den som ett fel att titta på.
        const ok =
          result.status === "draft_cron" ||
          result.status === "draft" ||
          result.status === "skipped_already_finalized";
        await supabaseAdmin.rpc("complete_pipeline_queue_item", {
          p_id: row.id,
          p_success: ok,
          p_error: ok ? null : `Oväntat resultat: ${result.status}`,
          p_claimed_at: row.claimed_at,
        });
      } catch (err) {
        console.error(
          `generate_monthly_reports tick: company ${row.company_id} failed:`,
          err,
        );
        await supabaseAdmin.rpc("complete_pipeline_queue_item", {
          p_id: row.id,
          p_success: false,
          p_error: err instanceof Error ? err.message : String(err),
          p_claimed_at: row.claimed_at,
        });
      }
    }),
  );
  console.warn("generate_monthly_reports tick: batch complete");
}

// --- Main handler (samma dubbla auth-läge som analyze_website) ---

const isCronAuthorized = (req: Request) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret =
    req.headers.get("x-cron-secret") ||
    new URL(req.url).searchParams.get("secret");
  return !!cronSecret && providedSecret === cronSecret;
};

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    (isCronAuthorized(req)
      ? (next: () => Promise<Response>) => next()
      : (next: () => Promise<Response>) =>
          AuthMiddleware(req, async (req) =>
            UserMiddleware(req, async () => next()),
          ))(async () => {
      if (req.method !== "POST") {
        return createErrorResponse(405, "Method Not Allowed");
      }
      try {
        const body = await parseRequiredJsonBody(req);
        const tick = getOptionalBooleanField(body, "tick");
        if (tick) {
          const batchSize =
            getPositiveIntegerField(body, "batch_size", { required: false }) ??
            CRON_BATCH_SIZE;
          const job = runQueueTick(batchSize as number);
          if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
            EdgeRuntime.waitUntil(
              job.catch((err) =>
                console.error("generate_monthly_reports tick failed:", err),
              ),
            );
          } else {
            await job;
          }
          return createJsonResponse({ accepted: true }, { status: 202 });
        }

        const cron = getOptionalBooleanField(body, "cron");

        if (cron) {
          const sweep = runCronSweep();
          if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
            EdgeRuntime.waitUntil(sweep);
          } else {
            await sweep;
          }
          return createJsonResponse({ accepted: true }, { status: 202 });
        }

        const company_id = getPositiveIntegerField(body, "company_id", {
          required: true,
        });
        const periodStart = (body as { period_start?: unknown }).period_start;
        const periodEnd = (body as { period_end?: unknown }).period_end;
        const requestedPeriod =
          typeof periodStart === "string" && typeof periodEnd === "string"
            ? { startDate: periodStart, endDate: periodEnd }
            : undefined;
        const force = getOptionalBooleanField(body, "force") ?? false;
        const recommendedService =
          typeof (body as { recommended_service?: unknown })
            .recommended_service === "string"
            ? (body as { recommended_service: string }).recommended_service
            : undefined;
        const result = await generateReportForCompany(
          company_id as number,
          "manual",
          requestedPeriod,
          force,
          recommendedService,
        );
        return createJsonResponse({ success: true, ...result });
      } catch (error) {
        console.error("generate_monthly_reports request failed:", error);
        return errorResponseFromUnknown(error);
      }
    }),
  ),
);
