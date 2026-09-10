import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import {
  bookingStopsOutreach,
  getEventType,
  mapStatus,
} from "../_shared/calcomEvents.ts";

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
  if (!email) {
    console.log("findContactByEmail: ingen e-post att matcha mot");
    return null;
  }

  // OBS: .contains() med en JS-array som värde formaterar postgrest-js om
  // det som en Postgres array-literal ("{...}", kommaseparerad .toString()
  // på varje element) — inte JSON. För ett objekt-element blir det
  // "[object Object]", vilket Postgres avvisar med "invalid input syntax
  // for type json". Skicka därför en färdig JSON-sträng istället, så tar
  // biblioteket sträng-grenen och postar den rakt av.
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("id, company_id, sales_id")
    .contains("email_jsonb", JSON.stringify([{ email }]))
    .limit(1)
    .maybeSingle();

  console.log(
    "findContactByEmail:",
    JSON.stringify({ email, found: Boolean(data), data, error }),
  );

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * En bokning stoppar den kalla utkorgen.
 *
 * Utan det här fortsatte sekvensen mejla "hann du titta på det jag skickade?"
 * till någon som redan bokat möte med oss — det värsta enskilda felet i hela
 * kedjan, eftersom det avslöjar att avsändaren är en robot precis i det läge
 * där förtroendet är som färskast.
 *
 * Tre vägar till samma enrollment, för att den som bokar sällan gör det från
 * exakt den adress vi mejlade: kontakten, bolaget, och adressen vi faktiskt
 * skickade till. Vilken som helst räcker.
 */
async function stopOutreachForBooking(
  contactId: number | null,
  companyId: number | null,
  email: string | null,
): Promise<{ stopped: number; companies: number[] }> {
  const ids = new Set<number>();
  const companies = new Set<number>();
  if (companyId != null) companies.add(companyId);

  const filters: string[] = [];
  if (contactId != null) filters.push(`contact_id.eq.${contactId}`);
  if (companyId != null) filters.push(`company_id.eq.${companyId}`);
  if (filters.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("sequence_enrollments")
      .select("id, company_id")
      .eq("status", "active")
      .or(filters.join(","));
    if (error) console.error("booking: enrollment lookup failed:", error.message);
    for (const row of data ?? []) {
      ids.add(row.id as number);
      if (row.company_id != null) companies.add(row.company_id as number);
    }
  }

  // Adressen vi mejlade. Fångar fallet där bokaren inte finns som kontakt.
  if (email) {
    const { data } = await supabaseAdmin
      .from("email_sends")
      .select("metadata, company_id")
      .eq("to_email", email.toLowerCase())
      .order("id", { ascending: false })
      .limit(10);
    for (const row of data ?? []) {
      const enrollmentId = (row.metadata as Record<string, unknown> | null)
        ?.enrollment_id;
      if (typeof enrollmentId === "number") ids.add(enrollmentId);
      if (row.company_id != null) companies.add(row.company_id as number);
    }
  }

  if (ids.size === 0) {
    return { stopped: 0, companies: [...companies] };
  }

  const now = new Date().toISOString();
  const { data: stopped, error } = await supabaseAdmin
    .from("sequence_enrollments")
    .update({ status: "paused", paused_at: now, next_action_at: null })
    .in("id", [...ids])
    .eq("status", "active")
    .select("id, sequence_id, contact_id, company_id, current_step");
  if (error) {
    console.error("booking: enrollment stop failed:", error.message);
    return { stopped: 0, companies: [...companies] };
  }

  // Spåret i loggen är hela svaret på "varför slutade den mejla?".
  for (const row of stopped ?? []) {
    await supabaseAdmin.from("sequence_run_log").insert({
      enrollment_id: row.id,
      sequence_id: row.sequence_id,
      contact_id: row.contact_id,
      company_id: row.company_id,
      step: row.current_step,
      action_type: null,
      outcome: "stopped_meeting_booked",
      detail: { source: "calcom", booked_by: email },
    });
  }

  return { stopped: (stopped ?? []).length, companies: [...companies] };
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

      // Efter upserten, så att mötet är sparat även om stoppet krånglar.
      let outreach = { stopped: 0, companies: [] as number[] };
      if (bookingStopsOutreach(eventType)) {
        outreach = await stopOutreachForBooking(
          linkedContact?.id ?? null,
          linkedContact?.company_id ?? null,
          primaryEmail,
        );
        if (outreach.companies.length > 0) {
          // Bara framåt i tratten: ett bokat möte ska aldrig skriva över
          // closed_won för ett bolag som redan är kund.
          const { error: statusErr } = await supabaseAdmin
            .from("companies")
            .update({ lead_status: "meeting_booked" })
            .in("id", outreach.companies)
            // lead_status är null på nyskrapade bolag, och NOT IN på null ger
            // null — utan or-grenen hade just de aldrig fått sin status.
            .or(
              "lead_status.is.null,lead_status.not.in.(closed_won,meeting_booked)",
            );
          if (statusErr) {
            console.error("booking: lead_status failed:", statusErr.message);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true, data, outreach }), {
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
