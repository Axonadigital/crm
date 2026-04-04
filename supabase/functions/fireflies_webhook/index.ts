import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";

/**
 * Fireflies.ai Webhook Handler
 *
 * Receives "Transcription completed" events from Fireflies,
 * fetches the full transcript via GraphQL API, matches to
 * contacts/calendar events, stores in meeting_transcriptions,
 * and triggers AI analysis via the analyze_meeting function.
 *
 * Auth: HMAC-SHA256 via x-hub-signature header.
 * Configure in Fireflies Dashboard → Developer Settings.
 */

const FIREFLIES_WEBHOOK_SECRET = Deno.env.get("FIREFLIES_WEBHOOK_SECRET");
const FIREFLIES_API_KEY = Deno.env.get("FIREFLIES_API_KEY");
const FIREFLIES_GRAPHQL_URL = "https://api.fireflies.ai/graphql";

// --- Crypto helpers (same pattern as calcom_webhook) ---

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

// --- Contact matching (same pattern as calcom_webhook) ---

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

// --- Calendar event matching ---

async function findCalendarEvent(
  attendeeEmails: string[],
  meetingDate: string,
) {
  if (attendeeEmails.length === 0) return null;

  const date = new Date(meetingDate);
  const dayBefore = new Date(
    date.getTime() - 24 * 60 * 60 * 1000,
  ).toISOString();
  const dayAfter = new Date(date.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Try matching by attendee email within ±1 day of the meeting
  for (const email of attendeeEmails) {
    const { data } = await supabaseAdmin
      .from("calendar_events")
      .select("id")
      .contains("attendees", [{ email }])
      .gte("starts_at", dayBefore)
      .lte("starts_at", dayAfter)
      .limit(1)
      .maybeSingle();

    if (data) return data;
  }

  return null;
}

// --- Fireflies GraphQL API ---

const TRANSCRIPT_QUERY = `
  query Transcript($id: String!) {
    transcript(id: $id) {
      title
      date
      duration
      transcript_url
      audio_url
      sentences {
        speaker_name
        text
        start_time
        end_time
      }
      meeting_attendees {
        displayName
        email
      }
      summary {
        keywords
        action_items
        outline
        overview
        short_summary
        topics_discussed
      }
      sentiments {
        positive_pct
        neutral_pct
        negative_pct
      }
    }
  }
`;

async function fetchFirefliesTranscript(meetingId: string) {
  if (!FIREFLIES_API_KEY) {
    throw new Error("FIREFLIES_API_KEY not configured");
  }

  const response = await fetch(FIREFLIES_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FIREFLIES_API_KEY}`,
    },
    body: JSON.stringify({
      query: TRANSCRIPT_QUERY,
      variables: { id: meetingId },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fireflies API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (result.errors?.length) {
    throw new Error(
      `Fireflies GraphQL error: ${result.errors[0]?.message ?? "Unknown"}`,
    );
  }

  return result.data?.transcript ?? null;
}

// --- Build readable transcript text from sentences ---

function buildTranscriptText(
  sentences: Array<{ speaker_name: string; text: string }>,
): string {
  return sentences.map((s) => `[${s.speaker_name}]: ${s.text}`).join("\n");
}

// --- Trigger AI analysis (service role call to analyze_meeting) ---

async function triggerAnalysis(
  transcriptionId: number,
  contactId: number | null,
  companyId: number | null,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY for analysis");
    return;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/analyze_meeting`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          transcription_id: transcriptionId,
          contact_id: contactId,
          company_id: companyId,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("analyze_meeting failed:", errorText);
    }
  } catch (error) {
    console.error("analyze_meeting call error:", error);
  }
}

// --- Main handler ---

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }

    try {
      const rawBody = await req.text();

      // 1. Verify webhook secret
      if (!FIREFLIES_WEBHOOK_SECRET) {
        console.error("FIREFLIES_WEBHOOK_SECRET not configured");
        return createErrorResponse(500, "Webhook secret not configured");
      }

      const signatureHeader = req.headers.get("x-hub-signature") ?? "";
      const expectedSignature = await hmacSha256Hex(
        FIREFLIES_WEBHOOK_SECRET,
        rawBody,
      );
      const incomingSignature = normalizeSignature(signatureHeader);

      if (!incomingSignature || incomingSignature !== expectedSignature) {
        console.error("Invalid webhook signature", {
          hasIncoming: !!incomingSignature,
        });
        return new Response(
          JSON.stringify({ received: true, error: "invalid_signature" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // 2. Parse payload
      const body = JSON.parse(rawBody);
      const meetingId = body.meetingId;
      const eventType = body.eventType;

      console.log("Fireflies webhook received:", { meetingId, eventType });

      if (!meetingId) {
        return new Response(
          JSON.stringify({
            received: true,
            skipped: true,
            reason: "no_meeting_id",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      if (eventType !== "Transcription completed") {
        return new Response(
          JSON.stringify({ received: true, skipped: true, eventType }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // 3. Idempotency check
      const { data: existing } = await supabaseAdmin
        .from("meeting_transcriptions")
        .select("id")
        .eq("fireflies_meeting_id", meetingId)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ received: true, duplicate: true, id: existing.id }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // 4. Fetch full transcript from Fireflies GraphQL API
      const transcript = await fetchFirefliesTranscript(meetingId);

      if (!transcript) {
        console.error("Fireflies returned no transcript for:", meetingId);
        return new Response(
          JSON.stringify({ received: true, error: "transcript_not_found" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // 5. Match contact by attendee emails
      const attendeeEmails = (transcript.meeting_attendees ?? [])
        .map((a: { email?: string }) => a.email)
        .filter(Boolean) as string[];

      let matchedContact: {
        id: number;
        company_id: number | null;
        sales_id: number | null;
      } | null = null;

      for (const email of attendeeEmails) {
        matchedContact = await findContactByEmail(email);
        if (matchedContact) break;
      }

      // 6. Match calendar event
      const calendarEvent = await findCalendarEvent(
        attendeeEmails,
        transcript.date,
      );

      // 7. Build transcript text
      const transcriptText = transcript.sentences?.length
        ? buildTranscriptText(transcript.sentences)
        : (transcript.title ?? "No transcript content");

      // 8. Insert into meeting_transcriptions
      const { data: newRecord, error: insertError } = await supabaseAdmin
        .from("meeting_transcriptions")
        .insert({
          calendar_event_id: calendarEvent?.id ?? null,
          contact_id: matchedContact?.id ?? null,
          company_id: matchedContact?.company_id ?? null,
          transcription_text: transcriptText,
          transcription_source: "fireflies",
          fireflies_meeting_id: meetingId,
          fireflies_data: {
            title: transcript.title,
            date: transcript.date,
            duration: transcript.duration,
            transcript_url: transcript.transcript_url,
            audio_url: transcript.audio_url,
            meeting_attendees: transcript.meeting_attendees,
            summary: transcript.summary,
            sentiments: transcript.sentiments,
          },
        })
        .select("id")
        .single();

      if (insertError || !newRecord) {
        console.error("Insert transcription error:", insertError);
        return new Response(
          JSON.stringify({ received: true, error: "insert_failed" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }

      // 9. Trigger AI analysis (async, don't block webhook response)
      // EdgeRuntime.waitUntil keeps the function alive after responding
      const analysisPromise = triggerAnalysis(
        newRecord.id,
        matchedContact?.id ?? null,
        matchedContact?.company_id ?? null,
      );

      // Use waitUntil if available, otherwise await
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
        EdgeRuntime.waitUntil(analysisPromise);
      } else {
        await analysisPromise;
      }

      return new Response(
        JSON.stringify({
          received: true,
          transcription_id: newRecord.id,
          contact_matched: !!matchedContact,
          calendar_event_matched: !!calendarEvent,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    } catch (error) {
      console.error("fireflies_webhook error:", error);
      // Always return 200 to prevent Fireflies retry storms
      return new Response(
        JSON.stringify({
          received: true,
          error: error instanceof Error ? error.message : "processing_error",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }
  }),
);
