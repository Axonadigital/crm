import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    // This endpoint is called by Docuseal, NOT by an authenticated CRM user
    // Verify using webhook secret instead of JWT auth
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
      const submissionId = String(
        payload.data?.submission_id || payload.submission_id || payload.id,
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
        // Return 200 to prevent Docuseal from retrying
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // Map Docuseal events to quote status
      let newStatus: string | null = null;
      let signedAt: string | null = null;
      let documentUrl: string | null = null;

      if (eventType === "submission.completed") {
        // Only mark as signed when ALL parties have completed (not form.completed which fires per-submitter)
        newStatus = "signed";
        signedAt = new Date().toISOString();
        documentUrl =
          payload.data?.documents?.[0]?.url ||
          payload.data?.download_url ||
          null;
      } else if (
        eventType === "submission.declined" ||
        eventType === "form.declined"
      ) {
        newStatus = "declined";
      } else if (eventType === "form.completed") {
        // Individual submitter completed — ignore (Axona is pre-completed)
      } else if (
        eventType === "submission.viewed" ||
        eventType === "form.viewed"
      ) {
        // Only update to viewed if currently "sent"
        if (quote.status === "sent") {
          newStatus = "viewed";
        }
      }

      if (newStatus) {
        const updateData: Record<string, unknown> = { status: newStatus };
        if (signedAt) updateData.signed_at = signedAt;
        if (documentUrl) updateData.docuseal_document_url = documentUrl;

        await supabase.from("quotes").update(updateData).eq("id", quote.id);
      }

      // When fully signed: move deal to won, notify Discord, email customer
      if (eventType === "submission.completed") {
        // Fetch contact and company info for notifications
        const [contactResult, companyResult] = await Promise.all([
          quote.contact_id
            ? supabase
                .from("contacts")
                .select("first_name, last_name, email")
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
        const contactEmail = contact?.email;
        const companyName = company?.name || "Okänt företag";
        const quoteNumber = quote.quote_number || `#${quote.id}`;

        // 1. Move deal to "won"
        if (quote.deal_id) {
          await supabase
            .from("deals")
            .update({ stage: "won" })
            .eq("id", quote.deal_id);
        }

        // 2. Discord notification
        try {
          const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
          const channelId = Deno.env.get("DISCORD_CHANNEL_ID");

          if (botToken && channelId) {
            await fetch(
              `https://discord.com/api/v10/channels/${channelId}/messages`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bot ${botToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  embeds: [
                    {
                      title: "Avtal signerat!",
                      description: [
                        `**Offert:** ${quoteNumber}`,
                        `**Företag:** ${companyName}`,
                        `**Kontakt:** ${contactName}`,
                        `**Deal stage:** → Won`,
                      ].join("\n"),
                      color: 5763719,
                      timestamp: new Date().toISOString(),
                    },
                  ],
                }),
              },
            );
          }
        } catch (discordErr) {
          console.error("Discord notification failed:", discordErr);
        }

        // 3. Send confirmation email to customer
        try {
          const resendKey = Deno.env.get("RESEND_API_KEY");
          if (resendKey && contactEmail) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: "Axona Digital <noreply@axonadigital.se>",
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

            // Log in email_sends
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
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error) {
      console.error("docuseal_webhook error:", error);
      // Return 200 to prevent retries on processing errors
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
