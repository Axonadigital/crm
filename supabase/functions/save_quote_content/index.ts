import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  SaveQuoteContentError,
  saveQuoteContent,
} from "../_shared/quoteWorkflow/index.ts";

/**
 * Save quote content from the CRM seller editor.
 *
 * Phase 4 — this is the authenticated-seller counterpart to
 * `save_quote_edits` (which is called by the public WYSIWYG editor with
 * a write_token). Both delegate to the same `saveQuoteContent` shared
 * helper so there is exactly one backend code path that mutates
 * `quotes.generated_sections`.
 *
 * Auth: Supabase user JWT via `AuthMiddleware` + `UserMiddleware`
 * (same pattern as `generate_quote_text`). Any authenticated CRM user
 * can save; we do not enforce per-quote ownership here because the CRM
 * already restricts quote listings to the user's sales territory via RLS.
 *
 * POST { quote_id: number, sections: object }
 *   → merges sections with existing generated_sections via the shared
 *     helper's deep-merge rules
 *   → regenerates the HTML quote via generate_quote_pdf
 *   → returns { success: true, pdf_url: string | null }
 */

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let body: {
          quote_id?: number | string;
          sections?: Record<string, unknown>;
        };
        try {
          body = await req.json();
        } catch {
          return createErrorResponse(400, "Invalid JSON body");
        }

        const { quote_id, sections } = body;
        if (!quote_id || !sections) {
          return createErrorResponse(
            400,
            "Missing required fields: quote_id, sections",
          );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        async function regeneratePdf(
          qid: number | string,
        ): Promise<string | null> {
          try {
            const res = await fetch(
              `${supabaseUrl}/functions/v1/generate_quote_pdf`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({ quote_id: qid }),
              },
            );
            if (!res.ok) return null;
            const data = (await res.json()) as { pdf_url?: string };
            return data.pdf_url ?? null;
          } catch (e) {
            console.error("save_quote_content: PDF regeneration failed:", e);
            return null;
          }
        }

        try {
          const result = await saveQuoteContent({
            supabase: supabaseAdmin,
            quoteId: quote_id,
            sections,
            initiator: { source: "crm_seller", userId: user?.id ?? null },
            regeneratePdf,
          });

          return new Response(
            JSON.stringify({
              success: result.success,
              pdf_url: result.pdfUrl,
            }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            },
          );
        } catch (err) {
          if (err instanceof SaveQuoteContentError) {
            return createErrorResponse(err.status, err.message);
          }
          console.error("save_quote_content: unexpected error:", err);
          return createErrorResponse(
            500,
            err instanceof Error ? err.message : "Unknown error",
          );
        }
      }),
    ),
  ),
);
