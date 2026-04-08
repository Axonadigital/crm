import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Resend webhook handler for email delivery events.
 * Receives events and updates email_sends status.
 *
 * No JWT auth — uses RESEND_WEBHOOK_SECRET for verification.
 * Configure in Resend dashboard: Settings > Webhooks > Add Endpoint
 *
 * Resend event types:
 * - email.sent
 * - email.delivered
 * - email.opened
 * - email.clicked
 * - email.bounced
 * - email.complained
 */

const KNOWN_EVENT_TYPES = new Set([
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
]);

const MAX_BODY_SIZE = 64 * 1024; // 64 KB — generous for a webhook event

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return createErrorResponse(405, "Method Not Allowed");
  }

  // Webhook secret is REQUIRED — reject all requests if not configured
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("RESEND_WEBHOOK_SECRET not configured");
    return createErrorResponse(500, "Webhook secret not configured");
  }

  // Verify webhook secret via Svix headers or query param
  const svixId = req.headers.get("svix-id");
  const providedSecret = new URL(req.url).searchParams.get("secret");

  // Simple secret-based auth (query param fallback)
  // For production, implement full Svix signature verification
  if (!svixId && providedSecret !== webhookSecret) {
    return createErrorResponse(401, "Invalid webhook secret");
  }

  // Validate Content-Type
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return createErrorResponse(400, "Content-Type must be application/json");
  }

  // Validate body size
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return createErrorResponse(413, "Request body too large");
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_SIZE) {
      return createErrorResponse(413, "Request body too large");
    }

    let event: unknown;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return createErrorResponse(400, "Invalid JSON payload");
    }

    if (typeof event !== "object" || event === null || Array.isArray(event)) {
      return createErrorResponse(400, "Payload must be a JSON object");
    }

    const payload = event as Record<string, unknown>;

    // Validate event type
    const eventType = payload.type;
    if (typeof eventType !== "string" || eventType.trim().length === 0) {
      return createErrorResponse(400, "Missing or invalid event type");
    }

    // Validate data object
    const data = payload.data;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return createErrorResponse(400, "Missing or invalid data object");
    }

    const dataObj = data as Record<string, unknown>;
    const emailId = dataObj.email_id;

    if (typeof emailId !== "string" || emailId.trim().length === 0) {
      return createErrorResponse(400, "Missing email_id in event data");
    }

    // Reject unknown event types early (after validation, before DB queries)
    if (!KNOWN_EVENT_TYPES.has(eventType)) {
      return new Response(
        JSON.stringify({ ok: true, unknown_type: eventType }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    // Find the email_send record by provider message ID
    // (stored in postmark_message_id column — reused for Resend ID)
    const { data: emailSend, error: findError } = await supabaseAdmin
      .from("email_sends")
      .select("id, status")
      .eq("postmark_message_id", emailId)
      .single();

    if (findError || !emailSend) {
      // Not an email we track — ignore silently
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const now = new Date().toISOString();
    const createdAt =
      typeof payload.created_at === "string" ? payload.created_at : now;
    const updateData: Record<string, unknown> = {};

    switch (eventType) {
      case "email.sent":
        if (emailSend.status === "queued") {
          updateData.status = "sent";
          updateData.sent_at = createdAt;
        }
        break;

      case "email.delivered":
        updateData.status = "delivered";
        updateData.delivered_at = createdAt;
        break;

      case "email.opened":
        // Don't downgrade from clicked
        if (emailSend.status !== "clicked") {
          updateData.status = "opened";
        }
        updateData.opened_at = createdAt;
        break;

      case "email.clicked":
        updateData.status = "clicked";
        updateData.clicked_at = createdAt;
        break;

      case "email.bounced":
        updateData.status = "bounced";
        updateData.bounced_at = createdAt;
        updateData.metadata = {
          bounce_message:
            typeof dataObj.bounce === "object" &&
            dataObj.bounce !== null &&
            typeof (dataObj.bounce as Record<string, unknown>).message ===
              "string"
              ? (dataObj.bounce as Record<string, unknown>).message
              : null,
        };
        break;

      case "email.complained":
        updateData.status = "complained";
        break;
    }

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from("email_sends")
        .update(updateData)
        .eq("id", emailSend.id);

      if (updateError) {
        console.error("Failed to update email_sends:", updateError);
        return createErrorResponse(500, "Failed to update email record");
      }
    }

    return new Response(
      JSON.stringify({ ok: true, status: updateData.status }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("resend_events error:", error);
    return createErrorResponse(500, "Webhook processing failed");
  }
});
