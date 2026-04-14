import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Save inline quote edits made in the WYSIWYG HTML editor.
 *
 * Auth: validated via quotes.approval_token (write_token). No user JWT needed.
 *
 * POST { quote_id: number, write_token: string, sections: object }
 *  → merges sections with existing generated_sections
 *  → regenerates the HTML quote via generate_quote_pdf
 *  → returns { success: true, pdf_url: string }
 */

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (_req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    let body: {
      quote_id: number | string;
      write_token: string;
      sections: Record<string, unknown>;
    };

    try {
      body = await req.json();
    } catch {
      return createErrorResponse(400, "Invalid JSON body");
    }

    const { quote_id, write_token, sections } = body;

    if (!quote_id || !write_token || !sections) {
      return createErrorResponse(
        400,
        "Missing required fields: quote_id, write_token, sections",
      );
    }

    // Validate write_token against quotes.approval_token
    const { data: quote, error: quoteError } = await supabaseAdmin
      .from("quotes")
      .select("id, approval_token, generated_sections, status")
      .eq("id", quote_id)
      .single();

    if (quoteError || !quote) {
      return createErrorResponse(404, "Quote not found");
    }

    if (quote.approval_token !== write_token) {
      return createErrorResponse(403, "Invalid write token");
    }

    if (quote.status === "signed" || quote.status === "declined") {
      return createErrorResponse(
        409,
        "Cannot edit a quote that is already signed or declined",
      );
    }

    // Merge incoming sections with existing generated_sections.
    // For plain objects (e.g. upgrade_package) we deep-merge so that
    // non-editable sub-fields (includes, benefits) are preserved.
    // Arrays are replaced wholesale — they carry their own structure.
    function deepMerge(
      target: Record<string, unknown>,
      source: Record<string, unknown>,
    ): Record<string, unknown> {
      const result: Record<string, unknown> = { ...target };
      for (const key of Object.keys(source)) {
        const tv = target[key];
        const sv = source[key];
        if (
          sv !== null &&
          typeof sv === "object" &&
          !Array.isArray(sv) &&
          tv !== null &&
          typeof tv === "object" &&
          !Array.isArray(tv)
        ) {
          result[key] = deepMerge(
            tv as Record<string, unknown>,
            sv as Record<string, unknown>,
          );
        } else {
          result[key] = sv;
        }
      }
      return result;
    }

    const existing =
      (quote.generated_sections as Record<string, unknown>) ?? {};
    const merged = deepMerge(existing, sections as Record<string, unknown>);

    // Update generated_sections in DB
    const { error: updateError } = await supabaseAdmin
      .from("quotes")
      .update({ generated_sections: merged })
      .eq("id", quote_id);

    if (updateError) {
      return createErrorResponse(500, `Failed to save: ${updateError.message}`);
    }

    // Regenerate the HTML quote so the stored file reflects the edits
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let pdfUrl = "";
    try {
      const pdfRes = await fetch(
        `${supabaseUrl}/functions/v1/generate_quote_pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ quote_id }),
        },
      );
      if (pdfRes.ok) {
        const pdfData = await pdfRes.json();
        pdfUrl = pdfData.pdf_url ?? "";
      }
    } catch (e) {
      // PDF regeneration is best-effort — don't fail the save
      console.error("save_quote_edits: PDF regeneration failed:", e);
    }

    return new Response(JSON.stringify({ success: true, pdf_url: pdfUrl }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }),
);
