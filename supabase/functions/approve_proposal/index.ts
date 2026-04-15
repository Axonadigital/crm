import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getDocuSealBaseUrl } from "../_shared/serviceEndpoints.ts";
import {
  createSigningSubmission,
  DEAL_STAGE_PROPOSAL_FLOW,
  DocuSealSubmissionError,
  PIPELINE_STEP,
  withPipelineStep,
} from "../_shared/quoteWorkflow/index.ts";

/**
 * Approve Proposal
 *
 * Called when someone clicks the "Approve & Send" link from Discord.
 * Uses the approval_token (UUID) for authentication — no user JWT needed.
 */

async function notifyDiscord(embed: {
  title: string;
  description: string;
  color: number;
}) {
  try {
    let webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL") || "";
    if (!webhookUrl) {
      const { data } = await supabaseAdmin.rpc("get_discord_webhook_url");
      webhookUrl = data || "";
    }
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{ ...embed, timestamp: new Date().toISOString() }],
      }),
    });
  } catch (e) {
    console.warn("Discord notification failed:", e);
  }
}

async function sendProposalEmail(params: {
  to: string;
  contactName: string;
  companyName: string;
  quoteNumber: string;
  proposalUrl: string;
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "hej@axonadigital.se";
  if (!resendApiKey) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return;
  }

  const safeContact = escapeHtml(params.contactName);
  const safeCompany = escapeHtml(params.companyName);
  const safeQuoteNumber = escapeHtml(params.quoteNumber);
  const safeUrl = encodeURI(params.proposalUrl);
  if (!/^https?:\/\//i.test(safeUrl)) {
    console.error(
      "Invalid proposal URL protocol, skipping email:",
      params.proposalUrl,
    );
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="sv">
<head><meta charset="utf-8"></head>
<body style="font-family:Inter,-apple-system,sans-serif;margin:0;padding:0;background:#f5f5f5;">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#0a0a0a;padding:32px 40px;">
      <h1 style="color:#fff;font-size:20px;margin:0;">Offert ${safeQuoteNumber}</h1>
      <p style="color:#a3a3a3;font-size:14px;margin:8px 0 0;">Axona Digital AB</p>
    </div>
    <div style="padding:40px;">
      <p style="font-size:15px;color:#0a0a0a;line-height:1.6;margin:0 0 16px;">Hej ${safeContact},</p>
      <p style="font-size:15px;color:#525252;line-height:1.6;margin:0 0 24px;">Tack för ditt intresse! Vi har tagit fram en offert till ${safeCompany}. Klicka på knappen nedan för att granska offerten och signera avtalet.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">Visa offert och signera</a>
      </div>
      <p style="font-size:13px;color:#a3a3a3;line-height:1.6;margin:24px 0 0;">Om du har frågor, svara gärna på detta mejl så återkommer vi så snart vi kan.</p>
    </div>
    <div style="padding:24px 40px;background:#fafafa;border-top:1px solid #e5e5e5;">
      <p style="font-size:12px;color:#a3a3a3;margin:0;">Axona Digital AB | Östersund, Sverige</p>
    </div>
  </div>
</body>
</html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject: `Offert ${params.quoteNumber} — Axona Digital`,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Resend email error:", errorText);
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    if (!token) {
      return createErrorResponse(400, "Missing approval token");
    }

    const supabase = supabaseAdmin;

    try {
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("*")
        .eq("approval_token", token)
        .single();

      if (quoteError || !quote) {
        return new Response(
          htmlPage(
            "Ogiltig lank",
            "Offerten hittades inte eller lanken har redan anvants.",
            "error",
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 404,
          },
        );
      }

      if (quote.approved_at) {
        return new Response(
          htmlPage(
            "Redan godkand",
            `Offerten ${quote.quote_number || ""} godkandes ${new Date(quote.approved_at).toLocaleDateString("sv-SE")}.`,
            "info",
          ),
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }

      if (quote.status === "sent" || quote.status === "signed") {
        return new Response(
          htmlPage(
            "Redan skickad",
            `Offerten ${quote.quote_number || ""} har redan skickats till kunden.`,
            "info",
          ),
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
      }

      let contactEmail = "";
      let contactName = "";
      if (quote.contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", quote.contact_id)
          .single();
        if (contact) {
          contactName = `${contact.first_name} ${contact.last_name}`.trim();
          const emails = contact.email_jsonb || [];
          if (emails.length > 0) contactEmail = emails[0].email;
        }
      }

      if (!contactEmail) {
        return new Response(
          htmlPage("Ingen e-post", "Kontakten saknar e-postadress.", "error"),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 422,
          },
        );
      }

      let companyName = "";
      let companyOrgNumber = "";
      if (quote.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name, org_number")
          .eq("id", quote.company_id)
          .single();
        companyName = company?.name || "";
        companyOrgNumber = company?.org_number || "";
      }

      const { data: lineItems } = await supabase
        .from("quote_line_items")
        .select("description, quantity, unit_price, total")
        .eq("quote_id", quote.id)
        .order("sort_order");

      if (!quote.html_content && !quote.pdf_url) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const pdfResponse = await fetch(
          `${supabaseUrl}/functions/v1/generate_quote_pdf`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ quote_id: quote.id }),
          },
        );
        if (pdfResponse.ok) {
          const pdfResult = await pdfResponse.json();
          quote.pdf_url = pdfResult.pdf_url;
        }
      }

      const crmPublicUrl =
        Deno.env.get("CRM_PUBLIC_URL") ||
        Deno.env.get("ALLOWED_ORIGIN") ||
        "http://localhost:5173";
      const proposalUrl = `${crmPublicUrl}/quote.html?id=${quote.id}&token=${quote.approval_token}`;

      const docusealApiKey = Deno.env.get("DOCUSEAL_API_KEY");
      const docusealTemplateId = Deno.env.get("DOCUSEAL_TEMPLATE_ID");

      if (!docusealApiKey || !docusealTemplateId) {
        return new Response(
          htmlPage(
            "E-signering ej konfigurerad",
            "DOCUSEAL_API_KEY eller DOCUSEAL_TEMPLATE_ID saknas.",
            "error",
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 500,
          },
        );
      }

      const docusealBaseUrl = getDocuSealBaseUrl();

      // Delegate DocuSeal submission + quote status update to shared helper.
      // Phase 2: both signing paths go through createSigningSubmission.
      let signingResult;
      try {
        signingResult = await withPipelineStep(
          {
            supabase,
            quoteId: Number(quote.id),
            stepName: PIPELINE_STEP.DOCUSEAL_SUBMIT,
            metadata: { trigger: "discord_approval" },
          },
          () =>
            createSigningSubmission({
              supabase,
              initiator: { source: "discord_approval" },
              quote: {
                id: quote.id,
                quote_number: quote.quote_number,
                valid_until: quote.valid_until,
                total_amount: quote.total_amount,
                subtotal: quote.subtotal,
                vat_amount: quote.vat_amount,
                vat_rate: quote.vat_rate,
                payment_terms: quote.payment_terms,
                delivery_terms: quote.delivery_terms,
                terms_and_conditions: quote.terms_and_conditions,
                generated_text: quote.generated_text,
                currency: quote.currency,
                docuseal_submission_id: quote.docuseal_submission_id,
                docuseal_signing_url: quote.docuseal_signing_url,
                status: quote.status,
              },
              company: { name: companyName, org_number: companyOrgNumber },
              contact: { name: contactName, email: contactEmail },
              lineItems: lineItems || [],
              proposalUrl,
              docusealApiKey,
              docusealTemplateId: Number(docusealTemplateId),
              docusealBaseUrl,
            }),
        );
      } catch (err) {
        if (err instanceof DocuSealSubmissionError) {
          await notifyDiscord({
            title: "E-signering misslyckades",
            description: `**Offert:** ${quote.quote_number || quote.id}\n**DocuSeal ${err.status}:** ${err.body.slice(0, 500)}`,
            color: 15548997,
          });
          return new Response(
            htmlPage(
              "E-signering misslyckades",
              `DocuSeal API ${err.status}: ${err.body}`,
              "error",
            ),
            {
              headers: { "Content-Type": "text/html; charset=utf-8" },
              status: 502,
            },
          );
        }
        throw err;
      }

      const { signingUrl } = signingResult;
      const quoteNumber = quote.quote_number || `#${quote.id}`;

      await sendProposalEmail({
        to: contactEmail,
        contactName,
        companyName,
        quoteNumber,
        proposalUrl,
      });

      if (quote.deal_id) {
        await supabase
          .from("deals")
          .update({ stage: DEAL_STAGE_PROPOSAL_FLOW.PROPOSAL_SENT })
          .eq("id", quote.deal_id);
      }

      await supabase.from("email_sends").insert({
        contact_id: quote.contact_id,
        company_id: quote.company_id,
        sales_id: quote.sales_id,
        subject: `Offert ${quoteNumber} — E-signering skickad`,
        body: "Offert skickad via Resend med DocuSeal signeringslank",
        to_email: contactEmail,
        status: "sent",
        sent_at: new Date().toISOString(),
        metadata: {
          source: "docuseal_signing",
          quote_id: quote.id,
          signing_url: signingUrl,
        },
      });

      await notifyDiscord({
        title: "Offert godkand och skickad for e-signering!",
        description: [
          `**Offert:** ${quoteNumber}`,
          `**Foretag:** ${companyName}`,
          `**Skickad till:** ${contactName} (${contactEmail})`,
          `**Metod:** DocuSeal e-signering`,
          `**Deal stage:** → Proposal Sent`,
        ].join("\n"),
        color: 5763719,
      });

      return new Response(
        htmlPage(
          "Offert skickad for e-signering!",
          `Offert ${quoteNumber} har godkants och skickats till ${contactName} (${contactEmail}) for e-signering via DocuSeal.\n\nDealen har uppdaterats till "Proposal Sent".`,
          "success",
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    } catch (error) {
      console.error("approve_proposal error:", error);
      return new Response(
        htmlPage(
          "Nagot gick fel",
          "Ett oväntat fel uppstod. Kontakta oss om problemet kvarstar.",
          "error",
        ),
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
          status: 500,
        },
      );
    }
  }),
);

/** Escape HTML special characters to prevent XSS */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(
  title: string,
  message: string,
  type: "success" | "error" | "info",
): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const colors = {
    success: { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" },
    error: { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
    info: { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8" },
  };
  const c = colors[type];
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>body{font-family:Inter,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}.card{max-width:500px;padding:40px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);text-align:center}.icon{font-size:48px;margin-bottom:16px}h1{font-size:24px;font-weight:700;color:#0a0a0a;margin:0 0 12px}p{font-size:15px;color:#525252;line-height:1.6;margin:0;white-space:pre-line}.badge{display:inline-block;padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;background:${c.bg};color:${c.text};border:1px solid ${c.border};margin-bottom:20px}</style></head><body><div class="card"><div class="icon">${type === "success" ? "&#10003;" : type === "error" ? "&#10007;" : "&#8505;"}</div><div class="badge">${type === "success" ? "Klart" : type === "error" ? "Fel" : "Info"}</div><h1>${safeTitle}</h1><p>${safeMessage}</p></div></body></html>`;
}
