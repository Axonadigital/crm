import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Approve Proposal
 *
 * Called when someone clicks the "Approve & Send" link from Discord.
 * Uses the approval_token (UUID) for authentication — no user JWT needed.
 *
 * Flow:
 * 1. Validate approval token
 * 2. Generate PDF if not already generated
 * 3. Send quote email to client via Resend
 * 4. Update quote status to "sent"
 * 5. Update deal stage to "proposal-sent"
 * 6. Post confirmation to Discord
 */

/** Send a Discord notification */
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

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    // Accept both GET (from Discord link click) and POST
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return createErrorResponse(400, "Missing approval token");
    }

    const supabase = supabaseAdmin;

    try {
      // ================================================================
      // Step 1: Validate approval token
      // ================================================================
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("*")
        .eq("approval_token", token)
        .single();

      if (quoteError || !quote) {
        return new Response(
          htmlPage(
            "Ogiltig länk",
            "Offerten hittades inte eller länken har redan använts.",
            "error",
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 404,
          },
        );
      }

      // Check if already approved
      if (quote.approved_at) {
        return new Response(
          htmlPage(
            "Redan godkänd",
            `Offerten ${quote.quote_number || ""} godkändes ${new Date(quote.approved_at).toLocaleDateString("sv-SE")}.`,
            "info",
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      }

      // Check if already sent
      if (quote.status === "sent" || quote.status === "signed") {
        return new Response(
          htmlPage(
            "Redan skickad",
            `Offerten ${quote.quote_number || ""} har redan skickats till kunden.`,
            "info",
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      }

      // ================================================================
      // Step 2: Get contact email
      // ================================================================
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
          if (emails.length > 0) {
            contactEmail = emails[0].email;
          }
        }
      }

      if (!contactEmail) {
        return new Response(
          htmlPage(
            "Ingen e-post",
            "Kontakten saknar e-postadress. Lägg till en e-post i CRM:et och försök igen.",
            "error",
          ),
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 422,
          },
        );
      }

      // ================================================================
      // Step 3: Ensure PDF exists
      // ================================================================
      if (!quote.pdf_url) {
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

        if (!pdfResponse.ok) {
          return new Response(
            htmlPage(
              "PDF-generering misslyckades",
              "Kunde inte generera PDF. Kontrollera offerten i CRM:et.",
              "error",
            ),
            {
              headers: { "Content-Type": "text/html; charset=utf-8" },
              status: 500,
            },
          );
        }

        const pdfResult = await pdfResponse.json();
        quote.pdf_url = pdfResult.pdf_url;
      }

      // ================================================================
      // Step 4: Send email to client via Resend
      // ================================================================
      const resendApiKey = Deno.env.get("RESEND_API_KEY");

      // Get seller company info
      const { data: configData } = await supabase
        .from("configuration")
        .select("config")
        .eq("id", 1)
        .single();

      const config = configData?.config || {};
      const seller = config.sellerCompany || {};

      // Get sales person info
      let senderName = seller.companyName || "Axona Digital";
      let senderFirstName = "";
      if (quote.sales_id) {
        const { data: sales } = await supabase
          .from("sales")
          .select("first_name, last_name, email")
          .eq("id", quote.sales_id)
          .single();

        if (sales) {
          senderName = `${sales.first_name} ${sales.last_name}`.trim();
          senderFirstName = sales.first_name || "";
        }
      }

      // Get company name
      let companyName = "";
      if (quote.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("name")
          .eq("id", quote.company_id)
          .single();
        companyName = company?.name || "";
      }

      const quoteNumber = quote.quote_number || `#${quote.id}`;
      const firstName = contactName.split(" ")[0] || contactName;

      if (resendApiKey) {
        const fromEmail =
          Deno.env.get("RESEND_FROM_EMAIL") ||
          seller.email ||
          "noreply@axonadigital.se";

        const emailSubject = `Offert ${quoteNumber} — ${quote.title}`;
        const emailBody = `Hej ${firstName},

Tack för ett bra samtal. Baserat på vår diskussion har vi tagit fram en offert specifikt anpassad för er.

Ni hittar offerten här: ${quote.pdf_url}

Om allt ser bra ut, svara gärna på detta mail så sätter vi igång. Har ni frågor tar vi det enklast i ett kort möte.

${senderFirstName || senderName}
${seller.companyName || ""}`;

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: `${senderName} <${fromEmail}>`,
            to: [contactEmail],
            subject: emailSubject,
            text: emailBody,
            html: emailBody.replace(/\n/g, "<br>"),
            tags: [
              { name: "category", value: "proposal" },
              { name: "quote_id", value: String(quote.id) },
            ],
          }),
        });

        if (!resendResponse.ok) {
          const errorData = await resendResponse.text();
          console.error("Resend API error:", errorData);

          await notifyDiscord({
            title: "E-postutskick misslyckades",
            description: `**Offert:** ${quoteNumber}\n**Till:** ${contactEmail}\n**Fel:** ${errorData.substring(0, 200)}`,
            color: 15548997, // Red
          });

          return new Response(
            htmlPage(
              "E-postutskick misslyckades",
              `Kunde inte skicka email till ${contactEmail}. Kontrollera RESEND_API_KEY och försök igen.`,
              "error",
            ),
            {
              headers: { "Content-Type": "text/html; charset=utf-8" },
              status: 502,
            },
          );
        }

        // Log the email send
        await supabase.from("email_sends").insert({
          contact_id: quote.contact_id,
          company_id: quote.company_id,
          sales_id: quote.sales_id,
          subject: emailSubject,
          body: emailBody,
          to_email: contactEmail,
          from_email: fromEmail,
          status: "sent",
          sent_at: new Date().toISOString(),
          metadata: {
            source: "proposal_automation",
            quote_id: quote.id,
          },
        });
      } else {
        console.warn("RESEND_API_KEY not configured — skipping email send");
      }

      // ================================================================
      // Step 5: Update quote status
      // ================================================================
      await supabase
        .from("quotes")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
        })
        .eq("id", quote.id);

      // ================================================================
      // Step 6: Update deal stage to "proposal-sent"
      // ================================================================
      if (quote.deal_id) {
        await supabase
          .from("deals")
          .update({ stage: "proposal-sent" })
          .eq("id", quote.deal_id);
      }

      // ================================================================
      // Step 7: Post confirmation to Discord
      // ================================================================
      await notifyDiscord({
        title: "Offert godkand och skickad!",
        description: [
          `**Offert:** ${quoteNumber}`,
          `**Foretag:** ${companyName}`,
          `**Skickad till:** ${contactName} (${contactEmail})`,
          `**Deal stage:** → Proposal Sent`,
        ].join("\n"),
        color: 5763719, // Green
      });

      // Return a nice HTML confirmation page
      return new Response(
        htmlPage(
          "Offert skickad!",
          `Offert ${quoteNumber} har godkänts och skickats till ${contactName} (${contactEmail}).\n\nDealen har uppdaterats till "Proposal Sent".`,
          "success",
        ),
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    } catch (error) {
      console.error("approve_proposal error:", error);
      return new Response(
        htmlPage(
          "Något gick fel",
          `${error instanceof Error ? error.message : "Okänt fel"}`,
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

/** Generate a simple HTML status page for the approval flow */
function htmlPage(
  title: string,
  message: string,
  type: "success" | "error" | "info",
): string {
  const colors = {
    success: { bg: "#f0fdf4", border: "#22c55e", text: "#15803d" },
    error: { bg: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
    info: { bg: "#eff6ff", border: "#3b82f6", text: "#1d4ed8" },
  };
  const c = colors[type];

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{font-family:Inter,-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
    .card{max-width:500px;padding:40px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);text-align:center}
    .icon{font-size:48px;margin-bottom:16px}
    h1{font-size:24px;font-weight:700;color:#0a0a0a;margin:0 0 12px}
    p{font-size:15px;color:#525252;line-height:1.6;margin:0;white-space:pre-line}
    .badge{display:inline-block;padding:6px 16px;border-radius:6px;font-size:13px;font-weight:600;background:${c.bg};color:${c.text};border:1px solid ${c.border};margin-bottom:20px}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${type === "success" ? "&#10003;" : type === "error" ? "&#10007;" : "&#8505;"}</div>
    <div class="badge">${type === "success" ? "Klart" : type === "error" ? "Fel" : "Info"}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
