import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  buildCallLogsContext,
  buildEmailContext,
  buildEnrichmentContext,
  buildMeetingContext,
  buildQuoteGenerationPrompts,
  fetchRecentCallLogs,
} from "../_shared/quoteGeneration.ts";

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

/** Send a Discord notification via Bot API (supports buttons) or webhook fallback. */
async function notifyDiscord(
  embed: {
    title: string;
    description: string;
    color: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
  },
  buttons?: Array<{ label: string; url: string }>,
) {
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
  const channelId = Deno.env.get("DISCORD_CHANNEL_ID") || "";

  const embedPayload = { ...embed, timestamp: new Date().toISOString() };

  // Use Bot API when we have bot token + channel (supports link buttons)
  if (botToken && channelId) {
    const payload: Record<string, unknown> = {
      embeds: [embedPayload],
    };

    if (buttons && buttons.length > 0) {
      payload.components = [
        {
          type: 1,
          components: buttons.map((btn) => ({
            type: 2,
            style: 5,
            label: btn.label,
            url: btn.url,
          })),
        },
      ];
    }

    const res = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${botToken}`,
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      console.error(
        `Discord Bot API failed: ${res.status} ${await res.text()}`,
      );
    }
    return;
  }

  // Fallback: webhook (no button support, links go in embed text)
  let webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL") || "";

  if (!webhookUrl) {
    const { data } = await supabaseAdmin.rpc("get_discord_webhook_url");
    webhookUrl = data || "";
  }

  if (!webhookUrl) {
    console.warn("orchestrate_proposal: no discord webhook URL configured");
    return;
  }

  // Append button links as text in description when using webhook
  if (buttons && buttons.length > 0) {
    const linkLines = buttons
      .map((btn) => `**${btn.label}:** ${btn.url}`)
      .join("\n");
    embedPayload.description += `\n\n${linkLines}`;
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embedPayload] }),
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

      const enrichmentContext = buildEnrichmentContext(company);
      const meetingContext = buildMeetingContext(meetingAnalysis);

      const recentCallLogs = await fetchRecentCallLogs(supabase, {
        contactId: contact?.id,
        companyId: company?.id,
      });
      const callLogsContext = buildCallLogsContext(recentCallLogs);

      // Build email context
      let emailContext = "";
      if (contact?.id) {
        const { data: recentEmails } = await supabase
          .from("email_sends")
          .select("subject, status, sent_at")
          .eq("contact_id", contact.id)
          .order("created_at", { ascending: false })
          .limit(3);

        if (recentEmails) {
          emailContext = buildEmailContext(recentEmails);
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

      const { prompt, systemPrompt } = buildQuoteGenerationPrompts({
        companyName: company?.name || "Okänt företag",
        contactName: contactName || "kunden",
        sector: company?.sector,
        industry: company?.industry,
        companyDescription: company?.description,
        enrichmentContext,
        quoteTitle,
        isWebProject,
        lineItemsText,
        meetingContext,
        callLogsContext,
        emailContext,
        kbTemplate,
      });

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

      // Determine if quote is for a multi-page website (hide upgrade upsell)
      const isMultiPage =
        deal.category?.toLowerCase().includes("fler") ||
        quoteTitle?.toLowerCase().includes("flersidig") ||
        quoteTitle?.toLowerCase().includes("multi") ||
        deal.category === "webb-med-support";

      // Default problem cards
      const defaultProblemCards = [
        {
          number: "01",
          title: "Svårt att bli hittad",
          text: "Utan en hemsida syns ni inte när potentiella kunder söker efter era tjänster online. Konkurrenter med en webbplats fångar dessa förfrågningar.",
        },
        {
          number: "02",
          title: "Svårt att visa vad ni gör",
          text: "Utan en samlad plats att visa era tjänster, kompetens och kontaktuppgifter blir det svårare för kunder att bedöma och lita på er.",
        },
        {
          number: "03",
          title: "Förlorade förfrågningar",
          text: "Varje dag söker potentiella kunder online. Utan en webbplats går dessa förfrågningar till konkurrenter som syns.",
        },
      ];

      // Default package includes
      const defaultPackageIncludes = [
        "Skräddarsydd design",
        "Mobilanpassat",
        "SEO-optimerad struktur",
        "Kontaktformulär",
        "SSL-certifikat",
      ];

      // Upgrade package — null if this is already a multi-page quote
      const defaultUpgradePackage = isMultiPage
        ? null
        : {
            title: "Flersidig hemsida",
            description:
              "Vill ni ha mer utrymme att presentera era tjänster, projekt och ert team? Uppgradera till en flersidig hemsida med dedikerade undersidor.",
            price: "Offert på begäran",
            includes: [
              "Upp till 5 undersidor",
              "Dedikerad tjänstesida",
              "Om oss-sida med teamet",
              "Referensprojekt-sida",
              "Blogg eller nyhetssektion",
            ],
            benefits: [
              "Mer utrymme att berätta er historia",
              "Bättre SEO med fler indexerbara sidor",
              "Professionellare intryck för större kunder",
            ],
          };

      // Merge AI sections with defaults for any missing fields
      const enrichedSections = generatedSections
        ? {
            ...generatedSections,
            problem_cards:
              (generatedSections as Record<string, unknown>).problem_cards ??
              defaultProblemCards,
            package_includes:
              (generatedSections as Record<string, unknown>).package_includes ??
              defaultPackageIncludes,
            upgrade_package:
              "upgrade_package" in generatedSections
                ? (generatedSections as Record<string, unknown>).upgrade_package
                : defaultUpgradePackage,
            process_steps: (generatedSections as Record<string, unknown>)
              .process_steps ?? [
              {
                number: "01",
                title: "Signering & uppstart",
                text: "Ni godkänner offerten. Vi samlar in material — logga, texter, bilder — och påbörjar designarbetet.",
              },
              {
                number: "02",
                title: "Demoversion klar",
                text: "Vi presenterar en komplett demoversion av er hemsida som ni kan granska och ge feedback på.",
              },
              {
                number: "03",
                title: "Korrigeringar",
                text: "Vi justerar efter era önskemål. Upp till två korrigeringsrundor ingår i priset.",
              },
              {
                number: "04",
                title: "Lansering",
                text: "Vi publicerar hemsidan, kopplar domänen och säkerställer att allt fungerar. Ni äger allt.",
              },
            ],
            support_cards: (generatedSections as Record<string, unknown>)
              .support_cards ?? [
              {
                icon: "check-circle",
                title: "Innan lansering",
                text: "Upp till två korrigeringsrundor ingår i priset efter att demoversionen presenterats. Vi finslipar tills ni är nöjda.",
              },
              {
                icon: "edit",
                title: "Egna ändringar",
                text: "Hemsidan byggs i Builder.io — ni kan själva göra enklare justeringar av texter och bilder utan att behöva kontakta oss.",
              },
              {
                icon: "headphones",
                title: "Support efter lansering",
                text: "Behöver ni hjälp med ändringar efter lansering? Vi finns tillgängliga på timdebitering — 1 500 kr/h exkl. moms.",
              },
              {
                icon: "shield",
                title: "Full äganderätt",
                text: "Vid leverans äger ni hemsidan helt. Inga inlåsningseffekter, inga löpande avgifter från vårt håll.",
              },
            ],
            tech_items: (generatedSections as Record<string, unknown>)
              .tech_items ?? [
              {
                icon: "smartphone",
                title: "Mobilanpassat",
                text: "Perfekt på alla enheter",
              },
              {
                icon: "search",
                title: "SEO-optimerat",
                text: "Syns på Google lokalt",
              },
              {
                icon: "zap",
                title: "Snabb laddtid",
                text: "Optimerad prestanda",
              },
              {
                icon: "lock",
                title: "SSL-krypterad",
                text: "Säker anslutning",
              },
            ],
            founders: (generatedSections as Record<string, unknown>)
              .founders ?? [
              {
                initials: "RJ",
                name: "Rasmus Jönsson",
                role: "Medgrundare & Teknisk ansvarig",
                description:
                  "Ansvarar för teknik och implementation. Fokuserar på robusta lösningar och att varje leverans ger mätbar effekt.",
              },
              {
                initials: "IP",
                name: "Isak Persson",
                role: "Medgrundare & Affärsutveckling",
                description:
                  "Ansvarar för affärsutveckling och uppföljning. Varje lösning ska ha ett tydligt syfte och ett resultat ni kan följa.",
              },
            ],
            // Section titles/texts — stored so WYSIWYG editor can save edits back
            problem_section_title:
              (generatedSections as Record<string, unknown>)
                .problem_section_title ?? null,
            package_section_title:
              (generatedSections as Record<string, unknown>)
                .package_section_title ?? "Välj det som passar er",
            package_section_text:
              (generatedSections as Record<string, unknown>)
                .package_section_text ??
              "Paketet nedan är skräddarsytt för er verksamhet och era behov.",
            reference_section_title:
              (generatedSections as Record<string, unknown>)
                .reference_section_title ?? "Hemsidor vi har byggt",
            reference_section_text:
              (generatedSections as Record<string, unknown>)
                .reference_section_text ??
              "Här är ett urval av webbplatser vi levererat — både ensidiga och flersidiga lösningar för företag i liknande branscher.",
            reference_projects:
              (generatedSections as Record<string, unknown>)
                .reference_projects ?? null,
            process_section_title:
              (generatedSections as Record<string, unknown>)
                .process_section_title ??
              "Från signering till lanserad hemsida",
            process_section_text:
              (generatedSections as Record<string, unknown>)
                .process_section_text ??
              "En tydlig process där ni alltid vet vad som händer härnäst.",
            support_section_title:
              (generatedSections as Record<string, unknown>)
                .support_section_title ?? "Vad som gäller efter lansering",
            tech_section_title:
              (generatedSections as Record<string, unknown>)
                .tech_section_title ?? "Byggt för att synas och prestera",
            about_section_title:
              (generatedSections as Record<string, unknown>)
                .about_section_title ?? "Vilka är Axona Digital?",
            about_section_text:
              (generatedSections as Record<string, unknown>)
                .about_section_text ??
              "Vi är en digital byrå i Östersund som hjälper svenska företag med hemsidor, e-handel och AI-lösningar. Varje leverans ska ge mätbar effekt — inte bara se bra ut.",
            price_summary_bullets:
              (generatedSections as Record<string, unknown>)
                .price_summary_bullets ?? null,
            // Recurring payment — passed through from deal
            recurring_amount: deal.recurring_amount ?? null,
            recurring_interval: deal.recurring_interval ?? null,
          }
        : null;

      // Update quote with both structured and plain text
      const quoteUpdateData: Record<string, unknown> = {
        generated_text: generatedText,
        status: "generated",
      };
      if (enrichedSections) {
        quoteUpdateData.generated_sections = enrichedSections;
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
      // Step 8: Post to Discord for review
      // ================================================================
      const { data: updatedQuote } = await supabase
        .from("quotes")
        .select("quote_number")
        .eq("id", quote.id)
        .single();

      const quoteNumber = updatedQuote?.quote_number || `#${quote.id}`;
      const crmUrl =
        Deno.env.get("CRM_PUBLIC_URL") ||
        Deno.env.get("ALLOWED_ORIGIN") ||
        "http://localhost:5173";

      const totalAmount = deal.amount
        ? `${Number(deal.amount).toLocaleString("sv-SE")} ${currency}`
        : "Ej angivet";

      const previewUrl = `${crmUrl}/quote.html?id=${quote.id}`;

      // Build Discord link buttons
      const discordButtons: Array<{
        label: string;
        url: string;
        emoji?: string;
      }> = [];
      if (pdfUrl) {
        discordButtons.push({
          label: "Forhandsgranska",
          url: previewUrl,
        });
      }
      discordButtons.push({
        label: "Granska och skicka i CRM",
        url: `${crmUrl}/#/quotes/${quote.id}/show`,
      });

      await notifyDiscord(
        {
          title: "Ny offert redo for granskning",
          description: [
            `**Deal:** ${dealName}`,
            `**Foretag:** ${company?.name || "Okant"}`,
            `**Kontakt:** ${contactName || "Ingen kontakt"} (${primaryEmail})`,
            `**Belopp:** ${totalAmount}`,
            `**Offert:** ${quoteNumber}`,
          ].join("\n"),
          color: 3447003, // Blue
          fields: [
            {
              name: "AI-genererad text (forsta 200 tecken)",
              value:
                generatedText.substring(0, 200) +
                (generatedText.length > 200 ? "..." : ""),
            },
          ],
        },
        discordButtons,
      );

      return new Response(
        JSON.stringify({
          success: true,
          quote_id: quote.id,
          quote_number: quoteNumber,
          pdf_url: pdfUrl,
          review_url: `${crmUrl}/#/quotes/${quote.id}/show`,
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
