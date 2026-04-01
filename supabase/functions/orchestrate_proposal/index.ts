import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Orchestrate Proposal Generation
 *
 * Called automatically by a DB trigger (via pg_net) when a deal's stage
 * changes to "generating-proposal". Can also be called manually.
 *
 * Flow:
 * 1. Validate deal data (contact email, meeting analysis or line items)
 * 2. Auto-create a quote linked to the deal
 * 3. Generate AI text (calls generate_quote_text logic inline)
 * 4. Generate PDF (calls generate_quote_pdf logic inline)
 * 5. Post to Discord with Approve / Needs Edits links
 *
 * Auth: Accepts service_role key (from DB trigger) or user JWT.
 */

interface DealPayload {
  deal_id: number;
  company_id?: number;
  sales_id?: number;
  deal_name?: string;
  deal_amount?: number;
  deal_category?: string;
}

/** Send a Discord notification. Reads webhook URL from env or vault. */
async function notifyDiscord(embed: {
  title: string;
  description: string;
  color: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}) {
  // Prefer env var, fall back to vault
  let webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL") || "";

  if (!webhookUrl) {
    // Try reading from vault via raw SQL
    const { data } = await supabaseAdmin.rpc("get_discord_webhook_url");
    webhookUrl = data || "";
  }

  if (!webhookUrl) {
    console.warn("orchestrate_proposal: no discord webhook URL configured");
    return;
  }

  const payload = {
    embeds: [
      {
        ...embed,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Post an error/warning to Discord */
async function notifyDiscordError(dealName: string, message: string) {
  await notifyDiscord({
    title: "Proposal Generation Failed",
    description: `**Deal:** ${dealName}\n**Error:** ${message}`,
    color: 15548997, // Red
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    // Authenticate: accept service_role JWT OR user JWT
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return createErrorResponse(401, "Missing authorization token");
    }

    // Check if this is a service_role JWT by decoding the payload
    let isServiceRole = false;
    try {
      const payloadB64 = token.split(".")[1];
      if (payloadB64) {
        const payload = JSON.parse(atob(payloadB64));
        isServiceRole = payload.role === "service_role";
      }
    } catch {
      // Not a valid JWT format — will try user auth below
    }

    if (!isServiceRole) {
      // Verify as user JWT
      try {
        const { data: userData } = await supabaseAdmin.auth.getUser(token);
        if (!userData?.user) {
          return createErrorResponse(401, "Unauthorized");
        }
      } catch {
        return createErrorResponse(401, "Unauthorized");
      }
    }

    // Keep service role key available for internal edge function calls
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || token;

    let payload: DealPayload;
    try {
      payload = await req.json();
    } catch {
      return createErrorResponse(400, "Invalid JSON body");
    }

    const { deal_id } = payload;
    if (!deal_id) {
      return createErrorResponse(400, "Missing deal_id");
    }

    const supabase = supabaseAdmin;

    try {
      // ================================================================
      // Step 1: Fetch deal with related data
      // ================================================================
      const { data: deal, error: dealError } = await supabase
        .from("deals")
        .select(
          "*, companies(id, name, sector, description, website, address, zipcode, city, lead_score, segment, has_facebook, facebook_url, has_instagram, instagram_url, website_score, industry, phone_number)",
        )
        .eq("id", deal_id)
        .single();

      if (dealError || !deal) {
        return createErrorResponse(404, "Deal not found");
      }

      const company = (deal as any).companies;
      const dealName = deal.name || "Unnamed deal";

      // ================================================================
      // Step 2: Find primary contact for this deal/company
      // ================================================================
      let contact = null;

      // Try to find contact linked to this deal
      // Note: deals uses contact_ids (integer array), not contact_id
      const contactIds = deal.contact_ids;
      if (Array.isArray(contactIds) && contactIds.length > 0) {
        const { data } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", contactIds[0])
          .single();
        contact = data;
      }

      // Fallback: find first contact linked to the company
      if (!contact && company?.id) {
        const { data } = await supabase
          .from("contacts")
          .select("*")
          .eq("company_id", company.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
        contact = data;
      }

      // ================================================================
      // Step 3: VALIDATION — check required data exists
      // ================================================================
      const validationErrors: string[] = [];

      // Check contact email
      const contactEmails = contact?.email_jsonb || [];
      const primaryEmail = contactEmails[0]?.email;
      if (!primaryEmail) {
        validationErrors.push(
          "No email found for contact — add an email to the contact first",
        );
      }

      // Check that we have SOME context for the proposal
      // (meeting analysis OR at least company description)
      let hasMeetingAnalysis = false;
      let meetingAnalysis: Record<string, unknown> | null = null;

      if (contact?.id || company?.id) {
        const meetingFilter: Record<string, unknown> = {};
        if (contact?.id) meetingFilter.contact_id = contact.id;
        else if (company?.id) meetingFilter.company_id = company.id;

        const { data: transcriptions } = await supabase
          .from("meeting_transcriptions")
          .select("analysis, analyzed_at")
          .match(meetingFilter)
          .not("analysis", "is", null)
          .order("analyzed_at", { ascending: false })
          .limit(1);

        if (transcriptions?.[0]?.analysis) {
          hasMeetingAnalysis = true;
          meetingAnalysis = transcriptions[0].analysis as Record<
            string,
            unknown
          >;
        }
      }

      if (!hasMeetingAnalysis && !company?.description && !company?.industry) {
        validationErrors.push(
          "No meeting analysis and no company description — add context before generating a proposal",
        );
      }

      // If validation fails, notify Discord and stop
      if (validationErrors.length > 0) {
        const errorMsg = validationErrors.join("\n");
        await notifyDiscordError(dealName, errorMsg);

        // Revert deal stage to "opportunity" so user can fix and retry
        await supabase
          .from("deals")
          .update({ stage: "opportunity" })
          .eq("id", deal_id);

        return createErrorResponse(422, errorMsg);
      }

      // ================================================================
      // Step 4: Fetch configuration (KB template, seller company)
      // ================================================================
      const { data: configData } = await supabase
        .from("configuration")
        .select("config")
        .eq("id", 1)
        .single();

      const config = configData?.config || {};
      const seller = config.sellerCompany || {};
      const kbTemplate = config.proposalKbTemplate || "";
      const currency = config.currency || "SEK";

      // ================================================================
      // Step 5: Auto-create quote linked to the deal
      // ================================================================
      const contactName = contact
        ? `${contact.first_name} ${contact.last_name}`.trim()
        : "";

      const quoteTitle = deal.name || `Offert — ${company?.name || "Kund"}`;

      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          title: quoteTitle,
          company_id: company?.id || deal.company_id,
          contact_id: contact?.id || null,
          deal_id: deal_id,
          sales_id: deal.sales_id || null,
          status: "draft",
          currency: currency,
          vat_rate: 25,
          discount_percent: 0,
          payment_terms: seller.defaultPaymentTerms || "30 dagar netto",
          delivery_terms: seller.defaultDeliveryTerms || "",
          terms_and_conditions: seller.defaultTermsAndConditions || "",
          valid_until: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        })
        .select()
        .single();

      if (quoteError || !quote) {
        const msg = `Failed to create quote: ${quoteError?.message || "Unknown error"}`;
        await notifyDiscordError(dealName, msg);
        return createErrorResponse(500, msg);
      }

      // If the deal has an amount, create a default line item
      if (deal.amount && deal.amount > 0) {
        const lineItemDesc =
          deal.category && deal.category !== "other"
            ? `${deal.category.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} — ${dealName}`
            : dealName;

        await supabase.from("quote_line_items").insert({
          quote_id: quote.id,
          description: lineItemDesc,
          quantity: 1,
          unit_price: deal.amount,
          sort_order: 0,
        });
      }

      // ================================================================
      // Step 6: Generate AI text (inline — same logic as generate_quote_text)
      // ================================================================
      const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicApiKey) {
        await notifyDiscordError(dealName, "ANTHROPIC_API_KEY not configured");
        return createErrorResponse(500, "ANTHROPIC_API_KEY not configured");
      }

      // Re-fetch line items (the trigger might have updated totals)
      const { data: lineItems } = await supabase
        .from("quote_line_items")
        .select("*")
        .eq("quote_id", quote.id)
        .order("sort_order", { ascending: true });

      // Build enrichment context
      let enrichmentContext = "";
      if (company) {
        const parts: string[] = [];
        if (company.lead_score)
          parts.push(`Lead score: ${company.lead_score}/100`);
        if (company.segment) parts.push(`Segment: ${company.segment}`);
        if (company.has_facebook && company.facebook_url)
          parts.push(`Facebook: aktiv (${company.facebook_url})`);
        if (company.has_instagram && company.instagram_url)
          parts.push(`Instagram: aktiv (${company.instagram_url})`);
        if (
          company.website_score !== undefined &&
          company.website_score !== null
        ) {
          const quality =
            company.website_score === 0
              ? "ingen hemsida"
              : company.website_score < 40
                ? "dålig hemsida"
                : company.website_score < 70
                  ? "ok hemsida"
                  : "bra hemsida";
          parts.push(
            `Hemsida: ${quality} (score ${company.website_score}/100)`,
          );
        }
        if (parts.length > 0) {
          enrichmentContext = `\nDigital närvaro: ${parts.join(", ")}`;
        }
      }

      // Build meeting context
      let meetingContext = "";
      if (meetingAnalysis) {
        const parts: string[] = [];
        if (meetingAnalysis.summary)
          parts.push(`Mötessammanfattning: ${meetingAnalysis.summary}`);
        if (
          Array.isArray(meetingAnalysis.customer_needs) &&
          meetingAnalysis.customer_needs.length > 0
        )
          parts.push(
            `Identifierade behov: ${(meetingAnalysis.customer_needs as string[]).join(", ")}`,
          );
        if (
          Array.isArray(meetingAnalysis.objections) &&
          meetingAnalysis.objections.length > 0
        )
          parts.push(
            `Invändningar: ${(meetingAnalysis.objections as string[]).join(", ")}`,
          );
        const qc = meetingAnalysis.quote_context as
          | Record<string, unknown>
          | undefined;
        if (qc?.budget_mentioned)
          parts.push(`Nämnd budget: ${qc.budget_mentioned}`);
        if (qc?.timeline) parts.push(`Önskad tidsram: ${qc.timeline}`);
        if (parts.length > 0) {
          meetingContext = `\n\nFRÅN SENASTE MÖTET:\n${parts.join("\n")}`;
        }
      }

      // Build email context
      let emailContext = "";
      if (contact?.id) {
        const { data: recentEmails } = await supabase
          .from("email_sends")
          .select("subject, status, sent_at")
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false })
          .limit(3);

        if (recentEmails && recentEmails.length > 0) {
          const emailLines = recentEmails.map(
            (e: { subject: string; status: string; sent_at: string }) =>
              `- "${e.subject}" (${e.status}, ${e.sent_at ? new Date(e.sent_at).toLocaleDateString("sv-SE") : "ej skickat"})`,
          );
          emailContext = `\n\nSENASTE E-POSTKOMMUNIKATION:\n${emailLines.join("\n")}`;
        }
      }

      const lineItemsText = (lineItems || [])
        .map(
          (item: {
            description: string;
            quantity: number;
            unit_price: number;
          }) =>
            `- ${item.description}: ${item.quantity} x ${item.unit_price} ${currency} = ${item.quantity * item.unit_price} ${currency}`,
        )
        .join("\n");

      // Determine if this is a web project
      const isWebProject =
        deal.category?.includes("webb") ||
        quoteTitle?.toLowerCase().includes("hemsida") ||
        quoteTitle?.toLowerCase().includes("webbplats") ||
        quoteTitle?.toLowerCase().includes("e-handel") ||
        quoteTitle?.toLowerCase().includes("shopify") ||
        company?.sector?.toLowerCase().includes("web");

      // Build KB template context
      const kbTemplateContext = kbTemplate
        ? `\n\nREFERENSOFFERT (imitera ton, struktur och detaljnivå — men INTE innehållet):\n---\n${kbTemplate}\n---`
        : "";

      const prompt = `Du ska generera strukturerat innehåll för en premium offert-PDF.

KONTEXT:
Kund: ${company?.name || "Okänt företag"}
Kontaktperson: ${contactName}
${company?.sector ? `Bransch: ${company.sector}` : ""}
${company?.industry ? `Industri: ${company.industry}` : ""}
${company?.description ? `Om kunden: ${company.description}` : ""}${enrichmentContext}
Offertens titel: ${quoteTitle}
Projekttyp: ${isWebProject ? "Webbprojekt (hemsida/e-handel)" : "Övrigt digitalt projekt"}

Tjänster vi offererar:
${lineItemsText || "Inga specificerade tjänster"}${meetingContext}${emailContext}${kbTemplateContext}

Svara med EXAKT detta JSON-format (inget annat):

{
  "summary_pitch": "2-3 meningar som sammanfattar projektet och vad kunden får. Fokus på värde och resultat, inte teknik.",
  "highlight_cards": [
    {
      "icon": "lucide-ikonnamn (välj bland: palette, layout, smartphone, search, zap, rocket, users, globe, shield, bar-chart, heart, mail, phone, clock, award)",
      "title": "Kort titel (2-3 ord)",
      "text": "En mening som beskriver vad kunden får"
    },
    { "icon": "...", "title": "...", "text": "..." },
    { "icon": "...", "title": "...", "text": "..." }
  ],
  ${isWebProject ? `"design_demo_description": "Kort beskrivning av vad designdemon visar, anpassad till kundens bransch",` : `"design_demo_description": null,`}
  "proposal_body": "Fullständig offertext (se instruktioner nedan)"
}

INSTRUKTIONER FÖR proposal_body:
1. Kort, personlig hälsning till ${contactName || "kunden"} (en mening)
2. Visa att ni förstår kundens situation och behov (2-3 meningar)
3. Beskriv varje tjänst med fokus på VÄRDET för kunden${meetingContext ? "\n4. Adressera invändningar från mötet" : ""}
${meetingContext ? "5" : "4"}. Avsluta med tydligt nästa steg

REGLER:
- Skriv på svenska
- Inga priser, belopp eller moms i texten
- Inga signaturer eller hälsningsfraser
- Tonen ska vara direkt, kompetent och personlig
- ALDRIG emojis
${kbTemplate ? "- IMITERA tonen från referensofferten" : ""}- Max 250 ord i proposal_body
- highlight_cards ska ha EXAKT 3 kort`;

      const systemPrompt = kbTemplate
        ? "Du skriver offerttexter för Axona Digital AB, en webb- och AI-byrå i Östersund. Du har fått en referensoffert att imitera — matcha dess ton, flöde och detaljnivå exakt, men skriv unikt innehåll för varje kund. Du skriver korthugget, konkret och värdedrivet. Du låter aldrig som en mall. Du undviker floskler som 'vi ser fram emot', 'tveka inte att kontakta oss', 'stärka er digitala närvaro'. Skriv som en senior konsult som pratar med en jämlike. SVARA ALLTID med ENBART giltig JSON."
        : "Du skriver offerttexter för Axona Digital AB, en webb- och AI-byrå i Östersund. Du skriver korthugget, konkret och värdedrivet. Du låter aldrig som en mall — varje text ska kännas skriven för just den kunden. Du undviker floskler som 'vi ser fram emot', 'tveka inte att kontakta oss', 'stärka er digitala närvaro'. Skriv som en senior konsult som pratar med en jämlike. SVARA ALLTID med ENBART giltig JSON.";

      const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
          system: systemPrompt,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("Claude API error:", errorText);
        await notifyDiscordError(dealName, "AI text generation failed");
        return createErrorResponse(502, "Failed to generate text from AI");
      }

      const aiResult = await aiResponse.json();
      const rawText = aiResult.content?.[0]?.text || "Failed to generate text";

      // Try to parse structured JSON
      let generatedSections: Record<string, unknown> | null = null;
      let generatedText = rawText;

      try {
        const jsonMatch = rawText.match(
          /\{[\s\S]*"summary_pitch"[\s\S]*"proposal_body"[\s\S]*\}/,
        );
        if (jsonMatch) {
          generatedSections = JSON.parse(jsonMatch[0]);
          generatedText =
            (generatedSections as { proposal_body?: string }).proposal_body ||
            generatedText;
        }
      } catch (parseError) {
        console.warn(
          "orchestrate_proposal: Failed to parse structured JSON, falling back to plain text:",
          parseError,
        );
      }

      // Update quote with both structured and plain text
      const quoteUpdateData: Record<string, unknown> = {
        generated_text: generatedText,
        status: "generated",
      };
      if (generatedSections) {
        quoteUpdateData.generated_sections = generatedSections;
      }

      await supabase.from("quotes").update(quoteUpdateData).eq("id", quote.id);

      // ================================================================
      // Step 7: Call generate_quote_pdf edge function
      // ================================================================
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
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

      let pdfUrl = "";
      if (pdfResponse.ok) {
        const pdfResult = await pdfResponse.json();
        pdfUrl = pdfResult.pdf_url || "";
      } else {
        console.error("PDF generation failed:", await pdfResponse.text());
        // Continue anyway — we can still post to Discord without PDF
      }

      // ================================================================
      // Step 8: Build approval URL and post to Discord
      // ================================================================
      // Refresh quote to get the approval_token
      const { data: updatedQuote } = await supabase
        .from("quotes")
        .select("approval_token, quote_number")
        .eq("id", quote.id)
        .single();

      const approvalToken = updatedQuote?.approval_token;
      const quoteNumber = updatedQuote?.quote_number || `#${quote.id}`;
      // Use public-facing URL for links (not Docker-internal supabaseUrl)
      const publicSupabaseUrl =
        Deno.env.get("API_EXTERNAL_URL") ||
        Deno.env.get("ALLOWED_ORIGIN_SUPABASE") ||
        "http://127.0.0.1:54321";
      const approveUrl = `${publicSupabaseUrl}/functions/v1/approve_proposal?token=${approvalToken}`;
      const crmUrl = Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173";
      const editUrl = `${crmUrl}/#/quotes/${quote.id}`;

      const totalAmount = deal.amount
        ? `${Number(deal.amount).toLocaleString("sv-SE")} ${currency}`
        : "Ej angivet";

      await notifyDiscord({
        title: "Ny offert redo for granskning",
        description: [
          `**Deal:** ${dealName}`,
          `**Foretag:** ${company?.name || "Okant"}`,
          `**Kontakt:** ${contactName || "Ingen kontakt"} (${primaryEmail})`,
          `**Belopp:** ${totalAmount}`,
          `**Offert:** ${quoteNumber}`,
          "",
          pdfUrl ? `**Forhandsgranska PDF:** ${pdfUrl}` : "",
          "",
          `**Godkann och skicka:** ${approveUrl}`,
          `**Redigera i CRM:** ${editUrl}`,
        ]
          .filter(Boolean)
          .join("\n"),
        color: 3447003, // Blue
        fields: [
          {
            name: "AI-genererad text (forsta 200 tecken)",
            value:
              generatedText.substring(0, 200) +
              (generatedText.length > 200 ? "..." : ""),
          },
        ],
      });

      return new Response(
        JSON.stringify({
          success: true,
          quote_id: quote.id,
          quote_number: quoteNumber,
          pdf_url: pdfUrl,
          approve_url: approveUrl,
          edit_url: editUrl,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        },
      );
    } catch (error) {
      console.error("orchestrate_proposal error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      await notifyDiscordError(payload.deal_name || `Deal #${deal_id}`, msg);
      return createErrorResponse(500, `Proposal orchestration failed: ${msg}`);
    }
  }),
);
