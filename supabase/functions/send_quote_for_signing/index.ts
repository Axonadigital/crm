import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  getDocuSealBaseUrl,
  getResendApiUrl,
} from "../_shared/serviceEndpoints.ts";
import {
  createSigningSubmission,
  DocuSealSubmissionError,
  PIPELINE_STEP,
  withPipelineStep,
} from "../_shared/quoteWorkflow/index.ts";

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST")
      return createErrorResponse(405, "Method Not Allowed");

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return createErrorResponse(401, "Missing authorization token");

    let isServiceRole = false;
    try {
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64));
        isServiceRole = payload.role === "service_role";
      }
    } catch {
      /* not a JWT */
    }

    if (!isServiceRole) {
      try {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (!userData?.user) return createErrorResponse(401, "Unauthorized");
      } catch {
        return createErrorResponse(401, "Unauthorized");
      }
    }

    try {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return createErrorResponse(400, "Invalid JSON body");
      }

      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return createErrorResponse(400, "Request body must be a JSON object");
      }

      const { quote_id: rawQuoteId } = body as Record<string, unknown>;

      if (
        rawQuoteId === undefined ||
        rawQuoteId === null ||
        rawQuoteId === ""
      ) {
        return createErrorResponse(400, "Missing quote_id");
      }

      // Accept both numeric IDs (integer) and UUID strings
      const quote_id = String(rawQuoteId);

      const docusealApiKey = Deno.env.get("DOCUSEAL_API_KEY");
      const docusealTemplateId = Deno.env.get("DOCUSEAL_TEMPLATE_ID");
      if (!docusealApiKey || !docusealTemplateId) {
        return createErrorResponse(
          500,
          "DOCUSEAL_API_KEY or DOCUSEAL_TEMPLATE_ID not configured",
        );
      }

      const docusealBaseUrl = getDocuSealBaseUrl();
      const supabase = supabaseAdmin;

      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quote_id)
        .single();
      if (quoteError || !quote)
        return createErrorResponse(404, "Quote not found");

      let signerEmail = "";
      let signerName = "";
      if (quote.contact_id) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", quote.contact_id)
          .single();
        if (contact) {
          signerName = `${contact.first_name} ${contact.last_name}`.trim();
          const emails = contact.email_jsonb || [];
          if (emails.length > 0) signerEmail = emails[0].email;
        }
      }
      if (!signerEmail)
        return createErrorResponse(400, "No email found for the contact");

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

      const crmPublicUrl =
        Deno.env.get("CRM_PUBLIC_URL") ||
        Deno.env.get("ALLOWED_ORIGIN") ||
        "http://localhost:5173";
      const proposalUrl = `${crmPublicUrl}/quote.html?id=${quote.id}`;

      // Delegate DocuSeal submission + status update to shared helper.
      // Phase 2: single source of truth for signing submissions.
      let signingResult;
      try {
        signingResult = await withPipelineStep(
          {
            supabase,
            quoteId: Number(quote.id),
            stepName: PIPELINE_STEP.DOCUSEAL_SUBMIT,
            metadata: { trigger: "crm_manual" },
          },
          () =>
            createSigningSubmission({
              supabase,
              initiator: { source: "crm_manual" },
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
              contact: { name: signerName, email: signerEmail },
              lineItems: lineItems || [],
              proposalUrl,
              docusealApiKey,
              docusealTemplateId: Number(docusealTemplateId),
              docusealBaseUrl,
            }),
        );
      } catch (err) {
        if (err instanceof DocuSealSubmissionError) {
          return createErrorResponse(
            502,
            "Failed to create signing submission",
          );
        }
        throw err;
      }

      const { submissionId, signingUrl } = signingResult;

      // Send signing invitation email via Resend.
      // Note: the email template diverges from approve_proposal today; phase 3
      // will unify them behind a shared sendSigningEmail helper.
      if (signingUrl) {
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail =
          Deno.env.get("RESEND_FROM_EMAIL") || "hej@axonadigital.se";

        if (resendApiKey) {
          const quoteLabel = quote.quote_number || `#${quote.id}`;
          const firstName = signerName.split(" ")[0] || signerName;

          const html = [
            `<p>Hej ${firstName},</p>`,
            `<p>Tack för att ni väljer Axona Digital! Din offert <strong>${quoteLabel}</strong> är nu klar för granskning och signering.</p>`,
            `<p>Klicka på knappen nedan för att läsa igenom offerten och signera avtalet digitalt:</p>`,
            `<p style="margin:24px 0;">`,
            `  <a href="${proposalUrl}" style="background:#1a1a1a;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px;">`,
            `    Granska och signera offert`,
            `  </a>`,
            `</p>`,
            `<p style="color:#888;font-size:13px;">Länken är personlig — dela den inte med andra.</p>`,
            `<p>Med vänlig hälsning,<br>Rasmus Jönsson<br>Axona Digital AB</p>`,
          ].join("\n");

          const emailRes = await fetch(`${getResendApiUrl()}/emails`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: `Axona Digital <${fromEmail}>`,
              to: [signerEmail],
              subject: `Din offert från Axona Digital — ${quoteLabel}`,
              html,
            }),
          });

          if (!emailRes.ok) {
            const errBody = await emailRes.text();
            console.error(
              "Resend signing email error:",
              emailRes.status,
              errBody,
            );
          } else {
            console.warn("Signing invitation sent via Resend to:", signerEmail);
          }
        } else {
          console.warn(
            "RESEND_API_KEY not configured — signing email not sent",
          );
        }
      }

      return new Response(
        JSON.stringify({
          submission_id: submissionId,
          signing_url: signingUrl,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    } catch (error) {
      console.error("send_quote_for_signing error:", error);
      return createErrorResponse(500, "Failed to send quote for signing");
    }
  }),
);
