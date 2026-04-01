import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Generate Quote Text — AI-powered structured proposal content.
 *
 * Produces both:
 * - `generated_sections` (JSONB): Structured content for premium template
 * - `generated_text` (text): Plain text fallback for backwards compatibility
 */

interface GeneratedSections {
  summary_pitch: string;
  highlight_cards: Array<{ icon: string; title: string; text: string }>;
  problem_cards: Array<{ number: string; title: string; text: string }>;
  design_demo_description: string | null;
  package_includes: string[];
  proposal_body: string;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, _user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        try {
          const { quote_id } = await req.json();
          if (!quote_id) {
            return createErrorResponse(400, "Missing quote_id");
          }

          const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
          if (!anthropicApiKey) {
            return createErrorResponse(500, "ANTHROPIC_API_KEY not configured");
          }

          const supabase = supabaseAdmin;

          // Fetch quote with related data
          const { data: quote, error: quoteError } = await supabase
            .from("quotes")
            .select("*")
            .eq("id", quote_id)
            .single();

          if (quoteError || !quote) {
            return createErrorResponse(404, "Quote not found");
          }

          // Fetch company
          const { data: company } = await supabase
            .from("companies")
            .select("*")
            .eq("id", quote.company_id)
            .single();

          // Fetch contact if linked
          let contact = null;
          if (quote.contact_id) {
            const { data } = await supabase
              .from("contacts")
              .select("*")
              .eq("id", quote.contact_id)
              .single();
            contact = data;
          }

          // Fetch line items
          const { data: lineItems } = await supabase
            .from("quote_line_items")
            .select("*")
            .eq("quote_id", quote_id)
            .order("sort_order", { ascending: true });

          // Fetch enrichment data from company
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

          // Fetch latest meeting analysis if available
          let meetingContext = "";
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
              const a = transcriptions[0].analysis as Record<string, unknown>;
              const parts: string[] = [];
              if (a.summary) parts.push(`Mötessammanfattning: ${a.summary}`);
              if (
                Array.isArray(a.customer_needs) &&
                a.customer_needs.length > 0
              )
                parts.push(
                  `Identifierade behov: ${(a.customer_needs as string[]).join(", ")}`,
                );
              if (Array.isArray(a.objections) && a.objections.length > 0)
                parts.push(
                  `Invändningar: ${(a.objections as string[]).join(", ")}`,
                );
              const qc = a.quote_context as Record<string, unknown> | undefined;
              if (qc?.budget_mentioned)
                parts.push(`Nämnd budget: ${qc.budget_mentioned}`);
              if (qc?.timeline) parts.push(`Önskad tidsram: ${qc.timeline}`);
              if (parts.length > 0) {
                meetingContext = `\n\nFRÅN SENASTE MÖTET:\n${parts.join("\n")}`;
              }
            }
          }

          // Fetch KB template from configuration
          let kbTemplate = "";
          {
            const { data: configData } = await supabase
              .from("configuration")
              .select("config")
              .eq("id", 1)
              .single();
            kbTemplate = configData?.config?.proposalKbTemplate || "";
          }

          // Fetch recent email interactions
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

          // Build context
          const contactName = contact
            ? `${contact.first_name} ${contact.last_name}`
            : "the team";

          const lineItemsText = (lineItems || [])
            .map(
              (item: {
                description: string;
                quantity: number;
                unit_price: number;
              }) =>
                `- ${item.description}: ${item.quantity} x ${item.unit_price} ${quote.currency} = ${item.quantity * item.unit_price} ${quote.currency}`,
            )
            .join("\n");

          // Determine if this is a web project
          const isWebProject =
            quote.template_type?.startsWith("webb") ||
            quote.title?.toLowerCase().includes("hemsida") ||
            quote.title?.toLowerCase().includes("webbplats") ||
            quote.title?.toLowerCase().includes("e-handel") ||
            quote.title?.toLowerCase().includes("shopify") ||
            company?.sector?.toLowerCase().includes("web");

          const kbTemplateContext = kbTemplate
            ? `\n\nREFERENSOFFERT (imitera ton, struktur och detaljnivå — men INTE innehållet):\n---\n${kbTemplate}\n---`
            : "";

          const prompt = `Du ska generera strukturerat innehåll för en premium offert-PDF.

KONTEXT:
Kund: ${company?.name || "Okänt företag"}
Kontaktperson: ${contactName}
${company?.sector ? `Bransch: ${company.sector}` : ""}
${company?.description ? `Om kunden: ${company.description}` : ""}${enrichmentContext}
Offertens titel: ${quote.title}
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
    {
      "icon": "...",
      "title": "...",
      "text": "..."
    },
    {
      "icon": "...",
      "title": "...",
      "text": "..."
    }
  ],
  "problem_cards": [
    {
      "number": "01",
      "title": "Kort problemtitel (2-4 ord)",
      "text": "2-3 meningar om problemet, anpassat efter kundens bransch. Fokus på: synlighet (kunder söker online, hittar de er?)"
    },
    {
      "number": "02",
      "title": "Kort problemtitel",
      "text": "2-3 meningar om problemet. Fokus på: förtroende (svårt att visa kompetens utan webbplats)"
    },
    {
      "number": "03",
      "title": "Kort problemtitel",
      "text": "2-3 meningar om problemet. Fokus på: förlorade möjligheter (varje dag går förfrågningar till konkurrenter)"
    }
  ],
  ${isWebProject ? `"design_demo_description": "Kort beskrivning av vad designdemon visar, anpassad till kundens bransch",` : `"design_demo_description": null,`}
  "package_includes": [
    "Punkt 1 som ingår i paketet (t.ex. 'Skräddarsydd ensidig hemsida')",
    "Punkt 2 (t.ex. 'Mobilanpassad design')",
    "Punkt 3 (t.ex. 'Kontaktformulär')",
    "Punkt 4 (t.ex. 'SEO-optimerad struktur')",
    "Punkt 5 (t.ex. 'SSL-certifikat')"
  ],
  "proposal_body": "Fullständig offertext (se instruktioner nedan)"
}

INSTRUKTIONER FÖR proposal_body:
1. Kort, personlig hälsning till ${contactName} (en mening)
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
- highlight_cards ska ha EXAKT 3 kort
- problem_cards ska ha EXAKT 3 kort, anpassade efter kundens bransch
- package_includes ska ha 4-6 punkter som beskriver vad som ingår i paketet
- Välj ikoner som passar innehållet`;

          const systemPrompt = `Du skriver offerttexter för Axona Digital AB, en webb- och AI-byrå i Östersund.

TONALITET:
- Professionell men jordnära — aldrig stel eller byråkratisk
- Rak och tydlig kommunikation, korta meningar
- Fokus på NYTTA och RESULTAT, inte teknisk jargong
- Tilltala kunden med "ni/er" (liten bokstav)
- ALDRIG emojis — använd typografiska tecken istället
- ALDRIG floskler som "vi ser fram emot", "tveka inte att kontakta oss", "stärka er digitala närvaro"
- Skriv som en senior konsult som pratar med en jämlike
- Varje text ska kännas skriven för just den kunden — aldrig som en mall
${kbTemplate ? "- Du har fått en referensoffert att imitera — matcha dess ton, flöde och detaljnivå exakt, men skriv unikt innehåll" : ""}

SVARA ALLTID med ENBART giltig JSON — inget annat.`;

          // Call Claude API
          const response = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
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
            },
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error("Claude API error:", errorText);
            return createErrorResponse(502, "Failed to generate text from AI");
          }

          const result = await response.json();
          const rawText =
            result.content?.[0]?.text || "Failed to generate text";

          // Try to parse structured JSON
          let generatedSections: GeneratedSections | null = null;
          let generatedText = rawText;

          try {
            // Extract JSON from response (handle potential markdown code blocks)
            const jsonMatch = rawText.match(
              /\{[\s\S]*"summary_pitch"[\s\S]*"proposal_body"[\s\S]*\}/,
            );
            if (jsonMatch) {
              generatedSections = JSON.parse(jsonMatch[0]) as GeneratedSections;
              // Use proposal_body as the plain text fallback
              generatedText = generatedSections.proposal_body || generatedText;
            }
          } catch (parseError) {
            console.warn(
              "Failed to parse structured JSON from AI, falling back to plain text:",
              parseError,
            );
            // generatedSections stays null, generatedText stays as raw response
          }

          // Update quote with both structured and plain text
          const updateData: Record<string, unknown> = {
            generated_text: generatedText,
            status: "generated",
          };
          if (generatedSections) {
            updateData.generated_sections = generatedSections;
          }

          const { error: updateError } = await supabase
            .from("quotes")
            .update(updateData)
            .eq("id", quote_id);

          if (updateError) {
            console.error("Update error:", updateError);
            return createErrorResponse(500, "Failed to save generated text");
          }

          return new Response(
            JSON.stringify({
              text: generatedText,
              sections: generatedSections,
            }),
            {
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders,
              },
            },
          );
        } catch (error) {
          console.error("generate_quote_text error:", error);
          return createErrorResponse(
            500,
            `Failed to generate quote text: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }),
    ),
  ),
);
