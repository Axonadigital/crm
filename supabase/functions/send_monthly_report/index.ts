import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse, createJsonResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  errorResponseFromUnknown,
  getPositiveIntegerField,
  parseRequiredJsonBody,
} from "../_shared/http.ts";
import { sendMonthlyReportEmail } from "../_shared/monthlyReport/sendMonthlyReportEmail.ts";
import { buildReportEmailHtml } from "../_shared/monthlyReport/buildReportEmailHtml.ts";
import { buildReportPdf } from "../_shared/monthlyReport/buildReportPdf.ts";
import {
  buildPresentationPolicy,
  resolvePresentation,
} from "../_shared/monthlyReport/reportPresentation.ts";
import type {
  PresentationPolicy,
  ReportAiContent,
  ReportMetrics,
  ReportViewModel,
} from "../_shared/monthlyReport/types.ts";

/**
 * Send Monthly Report — skickar en godkänd månadsrapport till kunden (user-JWT).
 *
 * Body: { report_id, overrides?: { recipient_email?, recipient_name?, generated_html? } }
 *
 * Idempotens på rapportnivå: skickar bara när status är 'draft' | 'approved' |
 * 'failed' och sätter 'sent' efteråt → ingen dubbel-utskick.
 */

function monthLabelSv(periodISO: string): string {
  return new Date(`${periodISO}T00:00:00Z`).toLocaleDateString("sv-SE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function sendReport(
  reportId: number,
  overrides: {
    recipient_email?: string;
    recipient_name?: string;
    ai_content?: ReportAiContent;
    presentation?: Partial<PresentationPolicy>;
  },
  preview = false,
): Promise<{
  report_id: number;
  status: string;
  email_send_id: number | null;
}> {
  const { data: report, error } = await supabaseAdmin
    .from("monthly_reports")
    .select(
      "id, company_id, period, status, recipient_email, recipient_name, generated_html, ai_content, metrics, view_model, pdf_storage_path, presentation_overrides",
    )
    .eq("id", reportId)
    .single();
  if (error || !report) throw new Error(`Report ${reportId} not found`);

  if (!preview) {
    if (report.status === "sent") {
      return {
        report_id: reportId,
        status: "already_sent",
        email_send_id: null,
      };
    }
    if (report.status === "approved") {
      return {
        report_id: reportId,
        status: "already_processing",
        email_send_id: null,
      };
    }
  }
  if (report.status !== "draft" && report.status !== "failed") {
    throw new Error(
      preview
        ? `Preview only available from draft/failed (status ${report.status})`
        : `Report cannot be sent from status ${report.status}`,
    );
  }

  const recipientEmail = overrides.recipient_email || report.recipient_email;
  if (!preview && !recipientEmail) {
    throw new Error("No recipient email — set one before sending");
  }

  const { data: company } = await supabaseAdmin
    .from("companies")
    .select("name")
    .eq("id", report.company_id)
    .single();
  const companyName = company?.name || "er sajt";
  const subject = `Er synlighet i ${monthLabelSv(report.period)} — ${companyName}`;

  const aiContent = (overrides.ai_content ??
    report.ai_content) as ReportAiContent | null;
  const viewModel = report.view_model as ReportViewModel | null;
  const metrics = report.metrics as ReportMetrics | null;
  if (!report.pdf_storage_path || !viewModel || !aiContent || !metrics) {
    throw new Error(
      "Report saknar underlag (view_model/metrics/PDF) — generera om draften först",
    );
  }

  // Resolverad presentations-policy: bas (auto) ⊕ sparade overrides ⊕ inkommande.
  const savedOverrides = (report.presentation_overrides ??
    {}) as Partial<PresentationPolicy>;
  const mergedOverrides: Partial<PresentationPolicy> = {
    ...savedOverrides,
    ...(overrides.presentation ?? {}),
  };
  const presentation = resolvePresentation(
    viewModel.presentation ?? buildPresentationPolicy(viewModel),
    mergedOverrides,
  );

  // Bygg ALLTID om mail-HTML + PDF server-side med resolverad policy så byggaren
  // förblir single source of truth (täcker både redigerad text och overrides).
  const hasSearchData =
    metrics.impressions?.current != null || metrics.clicks?.current != null;
  const html = buildReportEmailHtml({
    companyName,
    periodLabel: monthLabelSv(report.period),
    aiContent,
    metrics,
    viewModel,
    hasSearchData,
    presentation,
    replyToEmail: Deno.env.get("RESEND_FROM_EMAIL") || "hej@axonadigital.se",
    bookingUrl: Deno.env.get("MONTHLY_REPORT_BOOKING_URL") || undefined,
  });
  const refreshedPdf = await buildReportPdf({
    viewModel,
    aiContent,
    presentation,
  });
  const { error: uploadError } = await supabaseAdmin.storage
    .from("monthly-reports")
    .upload(report.pdf_storage_path, refreshedPdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`Could not update report PDF: ${uploadError.message}`);
  }

  // Preview-läge: spara om HTML/PDF + overrides, men skicka INTE och behåll draft.
  if (preview) {
    await supabaseAdmin
      .from("monthly_reports")
      .update({
        generated_html: html,
        ai_content: aiContent,
        presentation_overrides: mergedOverrides,
        recipient_email: recipientEmail ?? report.recipient_email,
        recipient_name: overrides.recipient_name ?? report.recipient_name,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq("id", reportId)
      .in("status", ["draft", "failed"]);
    return { report_id: reportId, status: "preview", email_send_id: null };
  }

  const { data: pdfData, error: pdfError } = await supabaseAdmin.storage
    .from("monthly-reports")
    .download(report.pdf_storage_path);
  if (pdfError || !pdfData) {
    throw new Error(`Could not load report PDF: ${pdfError?.message}`);
  }
  const pdfBytes = new Uint8Array(await pdfData.arrayBuffer());
  const safeCompanyName = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Markera approved innan utskick (spårbarhet om Resend skulle hänga).
  const { data: claimed } = await supabaseAdmin
    .from("monthly_reports")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      recipient_email: recipientEmail,
      recipient_name: overrides.recipient_name ?? report.recipient_name,
      ai_content: aiContent,
      generated_html: html,
      presentation_overrides: mergedOverrides,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", reportId)
    .in("status", ["draft", "failed"])
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return {
      report_id: reportId,
      status: "already_processing",
      email_send_id: null,
    };
  }

  let result;
  try {
    result = await sendMonthlyReportEmail({
      supabase: supabaseAdmin,
      monthlyReportId: reportId,
      companyId: report.company_id,
      toEmail: recipientEmail,
      subject,
      html,
      bodyPreview: aiContent?.summary ?? subject,
      period: report.period,
      attachment: {
        filename: `synlighetsrapport-${safeCompanyName || "kund"}-${report.period}.pdf`,
        content: pdfBytes,
      },
    });
  } catch (sendError) {
    // Släpp tillbaka till draft så teamet kan försöka igen.
    await supabaseAdmin
      .from("monthly_reports")
      .update({
        status: "draft",
        error:
          sendError instanceof Error ? sendError.message : String(sendError),
      })
      .eq("id", reportId);
    throw sendError;
  }

  await supabaseAdmin
    .from("monthly_reports")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      email_send_id: result.emailSendId,
      error: null,
    })
    .eq("id", reportId);

  return {
    report_id: reportId,
    status: "sent",
    email_send_id: result.emailSendId,
  };
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async () => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }
        try {
          const body = await parseRequiredJsonBody(req);
          const reportId = getPositiveIntegerField(body, "report_id", {
            required: true,
          });
          const overridesRaw = (body as { overrides?: unknown }).overrides;
          const overrides =
            overridesRaw && typeof overridesRaw === "object"
              ? (overridesRaw as {
                  recipient_email?: string;
                  recipient_name?: string;
                  ai_content?: ReportAiContent;
                  presentation?: Partial<PresentationPolicy>;
                })
              : {};
          // preview: true bygger om HTML/PDF med aktuella inställningar utan att
          // skicka (för "Uppdatera förhandsvisning" i CRM-modalen).
          const preview = (body as { preview?: unknown }).preview === true;
          const result = await sendReport(
            reportId as number,
            overrides,
            preview,
          );
          return createJsonResponse({ success: true, ...result });
        } catch (error) {
          return errorResponseFromUnknown(error);
        }
      }),
    ),
  ),
);
