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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return createErrorResponse(405, "Method Not Allowed");
  }

  // Verify webhook secret via Svix headers or query param
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (webhookSecret) {
    const svixId = req.headers.get("svix-id");
    const providedSecret = new URL(req.url).searchParams.get("secret");

    // Simple secret-based auth (query param fallback)
    // For production, implement full Svix signature verification
    if (!svixId && providedSecret !== webhookSecret) {
      return createErrorResponse(401, "Invalid webhook secret");
    }
  }

  try {
    const event = await req.json();

    // Resend webhook payload structure:
    // { type: "email.delivered", created_at: "...", data: { email_id: "...", ... } }
    const eventType = event.type as string;
    const emailId = event.data?.email_id;

    if (!emailId) {
      return createErrorResponse(400, "Missing email_id in event data");
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
    const updateData: Record<string, unknown> = {};

    switch (eventType) {
      case "email.sent":
        if (emailSend.status === "queued") {
          updateData.status = "sent";
          updateData.sent_at = event.created_at || now;
        }
        break;

      case "email.delivered":
        updateData.status = "delivered";
        updateData.delivered_at = event.created_at || now;
        break;

      case "email.opened":
        // Don't downgrade from clicked
        if (emailSend.status !== "clicked") {
          updateData.status = "opened";
        }
        updateData.opened_at = event.created_at || now;
        break;

      case "email.clicked":
        updateData.status = "clicked";
        updateData.clicked_at = event.created_at || now;
        break;

      case "email.bounced":
        updateData.status = "bounced";
        updateData.bounced_at = event.created_at || now;
        updateData.metadata = {
          bounce_message: event.data?.bounce?.message,
        };
        break;

      case "email.complained":
        updateData.status = "complained";
        break;

      default:
        return new Response(
          JSON.stringify({ ok: true, unknown_type: eventType }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
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
    return createErrorResponse(
      500,
      `Webhook processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
});
