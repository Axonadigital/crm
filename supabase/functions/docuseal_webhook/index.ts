import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      const webhookSecret = Deno.env.get("DOCUSEAL_WEBHOOK_SECRET");
      if (!webhookSecret) {
        console.error("DOCUSEAL_WEBHOOK_SECRET not configured");
        return createErrorResponse(500, "Webhook secret not configured");
      }

      const authHeader =
        req.headers.get("x-docuseal-secret") ||
        req.headers.get("authorization");
      if (
        authHeader !== webhookSecret &&
        authHeader !== `Bearer ${webhookSecret}`
      ) {
        return createErrorResponse(401, "Invalid webhook secret");
      }

      const payload = await req.json();
      const eventType = payload.event_type || payload.type;

      // DocuSeal CE sends submission ID in data.submission.id (form events)
      // or data.submission_id / payload.id (submission events)
      const submissionId = String(
        payload.data?.submission?.id ||
          payload.data?.submission_id ||
          payload.submission_id ||
          payload.id,
      );

      console.log(
        "docuseal_webhook received:",
        eventType,
        "submission:",
        submissionId,
      );

      if (!submissionId) {
        return createErrorResponse(400, "Missing submission_id in payload");
      }

      const supabase = supabaseAdmin;

      // Find the quote by docuseal_submission_id
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("id, status, deal_id, quote_number, contact_id, company_id")
        .eq("docuseal_submission_id", submissionId)
        .single();

      if (quoteError || !quote) {
        console.error("Quote not found for submission:", submissionId);
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // DocuSeal CE only sends form.* events (per submitter), not submission.* events.
      // Check data.submission.status to know if ALL parties have signed.
      const submissionStatus = payload.data?.submission?.status;
      const allPartiesSigned = submissionStatus === "completed";

      if (eventType === "form.completed" && allPartiesSigned) {
        // All parties have signed — mark as signed and trigger full flow
        const documentUrl =
          payload.data?.documents?.[0]?.url ||
          payload.data?.submission?.combined_document_url ||
          null;

        await supabase
          .from("quotes")
          .update({
            status: "signed",
            signed_at: new Date().toISOString(),
            ...(documentUrl ? { docuseal_document_url: documentUrl } : {}),
          })
          .eq("id", quote.id);

        // Fetch contact and company info for notifications
        const [contactResult, companyResult] = await Promise.all([
          quote.contact_id
            ? supabase
                .from("contacts")
                .select("first_name, last_name, email_jsonb")
                .eq("id", quote.contact_id)
                .single()
            : Promise.resolve({ data: null }),
          quote.company_id
            ? supabase
                .from("companies")
                .select("name")
                .eq("id", quote.company_id)
                .single()
            : Promise.resolve({ data: null }),
        ]);

        const contact = contactResult.data;
        const company = companyResult.data;
        const contactName = contact
          ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
          : "Kund";
        const emails = contact?.email_jsonb || [];
        const contactEmail = emails.length > 0 ? emails[0].email : null;
        const companyName = company?.name || "Okänt företag";
        const quoteNumber = quote.quote_number || `#${quote.id}`;

        // 1. Move deal to "won"
        if (quote.deal_id) {
          await supabase
            .from("deals")
            .update({ stage: "won" })
            .eq("id", quote.deal_id);
        }

        // 2. Discord notification handled by database trigger on deals.stage change

        // 3. Send confirmation email to customer
        try {
          const resendKey = Deno.env.get("RESEND_API_KEY");
          const fromEmail =
            Deno.env.get("RESEND_FROM_EMAIL") || "hej@axonadigital.se";
          if (resendKey && contactEmail) {
            const emailRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: `Axona Digital <${fromEmail}>`,
                to: contactEmail,
                subject: `Avtalsbekräftelse — ${quoteNumber}`,
                html: [
                  `<p>Hej ${contactName},</p>`,
                  `<p>Tack för att ni signerade avtalet! Vi har mottagit er signatur och avtalet är nu giltigt.</p>`,
                  `<p>Vi återkommer inom kort med nästa steg.</p>`,
                  `<p>Med vänlig hälsning,<br>Axona Digital AB</p>`,
                ].join("\n"),
              }),
            });

            if (!emailRes.ok) {
              const errBody = await emailRes.text();
              console.error("Resend API error:", emailRes.status, errBody);
            } else {
              console.log("Confirmation email sent to:", contactEmail);
            }

            await supabase.from("email_sends").insert({
              contact_id: quote.contact_id,
              company_id: quote.company_id,
              subject: `Avtalsbekräftelse — ${quoteNumber}`,
              to_email: contactEmail,
              status: "sent",
              sent_at: new Date().toISOString(),
              metadata: {
                source: "docuseal_completion",
                quote_id: quote.id,
              },
            });
          }
        } catch (emailErr) {
          console.error("Confirmation email failed:", emailErr);
        }
      } else if (
        eventType === "form.declined" ||
        eventType === "submission.declined"
      ) {
        await supabase
          .from("quotes")
          .update({ status: "declined" })
          .eq("id", quote.id);
      } else if (
        eventType === "form.viewed" ||
        eventType === "submission.viewed"
      ) {
        if (quote.status === "sent") {
          await supabase
            .from("quotes")
            .update({ status: "viewed" })
            .eq("id", quote.id);
        }
      }
      // form.completed with submission status != "completed" → Axona pre-sign, ignore

      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error) {
      console.error("docuseal_webhook error:", error);
      return new Response(
        JSON.stringify({ received: true, error: "processing_error" }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
          status: 200,
        },
      );
    }
  }),
);
