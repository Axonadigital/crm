import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";

const CALCOM_WEBHOOK_SECRET = Deno.env.get("CALCOM_WEBHOOK_SECRET");

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(digest);
}

async function hmacSha256Hex(secret: string, input: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(input),
  );
  return toHex(signature);
}

function normalizeSignature(input: string | null) {
  if (!input) return "";
  return input.startsWith("sha256=") ? input.slice(7) : input;
}

function getEventType(body: any) {
  return String(body.triggerEvent ?? body.type ?? "").toLowerCase();
}

function mapStatus(eventType: string) {
  if (eventType.includes("cancel")) {
    return "cancelled";
  }
  return "scheduled";
}

function extractAttendees(payload: any) {
  if (Array.isArray(payload?.attendees)) {
    return payload.attendees
      .map((attendee: any) => ({
        email: attendee?.email,
        name: attendee?.name,
      }))
      .filter((attendee: any) => Boolean(attendee.email));
  }
  return [];
}

async function findContactByEmail(email?: string | null) {
  if (!email) return null;

  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, company_id, sales_id")
    .contains("email_jsonb", [{ email }])
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      const rawBody = await req.text();

      if (!CALCOM_WEBHOOK_SECRET) {
        console.error("CALCOM_WEBHOOK_SECRET not configured");
        return createErrorResponse(500, "Webhook secret not configured");
      }

      const signatureHeader =
        req.headers.get("x-cal-signature-256") ??
        req.headers.get("x-cal-signature") ??
        "";

      const expectedSignature = await hmacSha256Hex(
        CALCOM_WEBHOOK_SECRET,
        rawBody,
      );
      const incomingSignature = normalizeSignature(signatureHeader);

      if (!incomingSignature || incomingSignature !== expectedSignature) {
        return createErrorResponse(401, "Invalid webhook signature");
      }

      const body = JSON.parse(rawBody);
      const eventType = getEventType(body);
      const payload = body.payload ?? body.data ?? body;

      const calcomEventId = String(
        payload?.bookingId ?? payload?.booking_id ?? payload?.id ?? "",
      );

      if (!calcomEventId) {
        return createErrorResponse(400, "Missing cal.com booking id");
      }

      const startsAt = new Date(
        payload?.startTime ??
          payload?.start_time ??
          payload?.start ??
          Date.now(),
      ).toISOString();
      const endsAt = new Date(
        payload?.endTime ??
          payload?.end_time ??
          payload?.end ??
          new Date(Date.now() + 30 * 60 * 1000),
      ).toISOString();

      const attendees = extractAttendees(payload);
      const rawMeetLink =
        payload?.meetingUrl ??
        payload?.location ??
        payload?.metadata?.videoCallUrl ??
        null;
      const meetLink =
        typeof rawMeetLink === "string"
          ? rawMeetLink
          : (rawMeetLink?.url ?? null);
      const primaryEmail =
        attendees[0]?.email ??
        payload?.email ??
        payload?.user?.email ??
        payload?.organizer?.email ??
        null;
      const linkedContact = await findContactByEmail(primaryEmail);

      const payloadHash = await sha256Hex(rawBody);
      const eventRecord = {
        title: payload?.title ?? payload?.eventType ?? "Website booking",
        description: payload?.description ?? payload?.notes ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        time_zone:
          payload?.timeZone ??
          payload?.time_zone ??
          payload?.timezone ??
          "Europe/Stockholm",
        contact_id: linkedContact?.id ?? null,
        company_id: linkedContact?.company_id ?? null,
        sales_id: linkedContact?.sales_id ?? null,
        status: mapStatus(eventType),
        source: "calcom",
        calcom_event_id: calcomEventId,
        meeting_provider: "google_meet",
        meet_link: meetLink,
        attendees,
        metadata: {
          calcom_event_type: eventType,
          payload_hash: payloadHash,
          received_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from("calendar_events")
        .upsert(eventRecord, {
          onConflict: "calcom_event_id",
        })
        .select("*")
        .single();

      if (error || !data) {
        return createErrorResponse(
          500,
          error?.message ?? "Failed to upsert calendar event",
        );
      }

      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (error) {
      return createErrorResponse(
        500,
        error instanceof Error ? error.message : "Webhook processing failed",
      );
    }
  }),
);
