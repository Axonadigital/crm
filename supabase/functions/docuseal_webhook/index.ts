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
        .select("id, status")
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

      if (
        eventType === "submission.completed" ||
        eventType === "form.completed"
      ) {
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
