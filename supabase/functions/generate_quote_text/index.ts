import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  buildCallLogsContext,
  buildEmailContext,
  buildEnrichmentContext,
  buildMeetingContext,
  buildQuoteGenerationPrompts,
  fetchRecentCallLogs,
  type QuoteGeneratedSections,
} from "../_shared/quoteGeneration.ts";
import {
  generateSections,
  PIPELINE_STEP,
  postDevDiscordAlert,
  QUOTE_STATUS,
  withPipelineStep,
} from "../_shared/quoteWorkflow/index.ts";

/**
 * Generate Quote Text — AI-powered structured proposal content.
 *
 * Produces both:
 * - `generated_sections` (JSONB): Structured content for premium template
 * - `generated_text` (text): Plain text fallback for backwards compatibility
 */

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

          const enrichmentContext = buildEnrichmentContext(company);

          // Fetch latest meeting analysis if available
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
              meetingAnalysis = transcriptions[0].analysis as Record<
                string,
                unknown
              >;
            }
          }
          const meetingContext = buildMeetingContext(meetingAnalysis);

          const recentCallLogs = await fetchRecentCallLogs(supabase, {
            contactId: contact?.id,
            companyId: company?.id,
          });
          const callLogsContext = buildCallLogsContext(recentCallLogs);

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

          // Build context
          const contactName = contact
            ? `${contact.first_name} ${contact.last_name}`
            : "teamet";

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

          const { prompt, systemPrompt } = buildQuoteGenerationPrompts({
            companyName: company?.name || "Okänt företag",
            contactName,
            sector: company?.sector,
            industry: company?.industry,
            companyDescription: company?.description,
            enrichmentContext,
            quoteTitle: quote.title,
            isWebProject,
            lineItemsText,
            meetingContext,
            callLogsContext,
            emailContext,
            kbTemplate,
          });

          // Delegate Anthropic call + regex parse to shared helper.
          // Phase 1: single source of truth for AI response handling.
          // Phase 3: quarantine AI output shape mismatches so a prompt
          // iteration or model drift does not silently save broken
          // sections into quote_pipeline_steps / generated_sections.
          let sectionResult;
          try {
            sectionResult = await withPipelineStep(
              {
                supabase,
                quoteId: quote_id,
                stepName: PIPELINE_STEP.GENERATE_TEXT,
                metadata: { trigger: "manual" },
              },
              () =>
                generateSections({
                  prompt,
                  systemPrompt,
                  apiKey: anthropicApiKey,
                  validation: {
                    supabase,
                    quoteId: Number(quote_id),
                    // Phase 3: dev alert even on the manual CRM path so
                    // quarantine policy matches the orchestrated path.
                    // Small shared helper keeps this tiny — no need to
                    // duplicate the full notifyDiscord logic from
                    // orchestrate_proposal here.
                    notifyDiscord: async (summary) => {
                      await postDevDiscordAlert({
                        supabase,
                        title: "AI output quarantined (manual generate)",
                        message: [
                          `**Quote:** ${quote_id}`,
                          `**Schema:** ${summary.schemaName}`,
                          `**Error:** ${summary.validationError}`,
                        ].join("\n"),
                      });
                    },
                  },
                }),
            );
          } catch (_aiError) {
            return createErrorResponse(502, "Failed to generate text from AI");
          }

          const { generatedText } = sectionResult;
          const generatedSections =
            sectionResult.generatedSections as QuoteGeneratedSections | null;

          // Update quote with both structured and plain text
          const updateData: Record<string, unknown> = {
            generated_text: generatedText,
            status: QUOTE_STATUS.GENERATED,
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
