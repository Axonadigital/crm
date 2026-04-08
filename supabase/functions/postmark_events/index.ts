import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

/**
 * Postmark delivery/open/click/bounce webhook handler.
 * Receives events from Postmark and updates email_sends status.
 *
 * No JWT auth — uses webhook secret for authentication.
 * Configure this function in Postmark: Settings > Webhooks > Add Webhook
 */

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return createErrorResponse(405, "Method Not Allowed");
  }

  // Verify webhook secret — REQUIRED, reject if not configured
  const webhookSecret = Deno.env.get("POSTMARK_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("POSTMARK_WEBHOOK_SECRET not configured");
    return createErrorResponse(500, "Webhook secret not configured");
  }

  const providedSecret =
    req.headers.get("x-postmark-webhook-secret") ||
    new URL(req.url).searchParams.get("secret");
  if (providedSecret !== webhookSecret) {
    return createErrorResponse(401, "Invalid webhook secret");
  }

  try {
    const event = await req.json();

    // Validate that the payload is an object
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      return createErrorResponse(400, "Invalid payload: expected JSON object");
    }

    // Postmark sends different event types
    // See: https://postmarkapp.com/developer/webhooks/webhooks-overview
    const messageId = event.MessageID;
    if (!messageId || typeof messageId !== "string") {
      return createErrorResponse(400, "Missing or invalid MessageID");
    }

    const recordType = event.RecordType;
    if (!recordType || typeof recordType !== "string") {
      return createErrorResponse(400, "Missing or invalid RecordType");
    }

    // Find the email_send record by postmark_message_id
    const { data: emailSend, error: findError } = await supabaseAdmin
      .from("email_sends")
      .select("id, status")
      .eq("postmark_message_id", messageId)
      .single();

    if (findError || !emailSend) {
      // Not an email we track — ignore silently
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Determine new status and timestamp based on event type
    const updateData: Record<string, unknown> = {};

    switch (recordType) {
      case "Delivery":
        updateData.status = "delivered";
        updateData.delivered_at = event.DeliveredAt || new Date().toISOString();
        break;

      case "Open":
        // Only upgrade status if not already clicked
        if (emailSend.status !== "clicked") {
          updateData.status = "opened";
        }
        updateData.opened_at = event.ReceivedAt || new Date().toISOString();
        break;

      case "Click":
        updateData.status = "clicked";
        updateData.clicked_at = event.ReceivedAt || new Date().toISOString();
        break;

      case "Bounce":
        updateData.status = "bounced";
        updateData.bounced_at = event.BouncedAt || new Date().toISOString();
        updateData.metadata = {
          bounce_type: event.Type,
          bounce_description: event.Description,
        };
        break;

      case "SpamComplaint":
        updateData.status = "complained";
        break;

      default:
        // Unknown event type — log but don't update
        console.log("Unknown Postmark event type:", recordType);
        return new Response(
          JSON.stringify({ ok: true, unknown_type: recordType }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
    }

    // Update email_sends record
    const { error: updateError } = await supabaseAdmin
      .from("email_sends")
      .update(updateData)
      .eq("id", emailSend.id);

    if (updateError) {
      console.error("Failed to update email_sends:", updateError);
      return createErrorResponse(500, "Failed to update email record");
    }

    return new Response(
      JSON.stringify({ ok: true, status: updateData.status }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error) {
    console.error("postmark_events error:", error);
    return createErrorResponse(500, "Webhook processing failed");
  }
});
