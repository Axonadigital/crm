import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";

type CalendarAction = "create" | "update" | "delete";

type CalendarEventPayload = {
  title?: string;
  description?: string | null;
  starts_at?: string;
  ends_at?: string;
  time_zone?: string;
  contact_id?: number | null;
  company_id?: number | null;
  sales_id?: number | null;
  status?: "scheduled" | "completed" | "cancelled";
  source?: "crm" | "calcom" | "google";
  google_event_id?: string | null;
  calcom_event_id?: string | null;
  meeting_provider?: "google_meet";
  meet_link?: string | null;
  attendees?: Array<{ email: string; name?: string }>;
  metadata?: Record<string, unknown> | null;
};

type ServiceAccountConfig = {
  client_email: string;
  private_key: string;
  token_uri: string;
};

const GOOGLE_CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID");
const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");

function normalizeIso(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return date.toISOString();
}

function normalizeServiceAccount(): ServiceAccountConfig | null {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    return null;
  }
  const parsed = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccountConfig;
  if (!parsed.client_email || !parsed.private_key || !parsed.token_uri) {
    return null;
  }
  return {
    ...parsed,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
}

async function sha256Hex(input: string) {
  const encoded = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getGoogleAccessToken(serviceAccount: ServiceAccountConfig) {
  const now = Math.floor(Date.now() / 1000);
  const privateKey = await jose.importPKCS8(serviceAccount.private_key, "RS256");
  const assertion = await new jose.SignJWT({
    scope: "https://www.googleapis.com/auth/calendar",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccount.client_email)
    .setSubject(serviceAccount.client_email)
    .setAudience(serviceAccount.token_uri)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const tokenResponse = await fetch(serviceAccount.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenResponse.ok) {
    const details = await tokenResponse.text();
    throw new Error(`Google token exchange failed: ${details}`);
  }

  const tokenJson = await tokenResponse.json();
  return tokenJson.access_token as string;
}

function buildGoogleEventBody(payload: CalendarEventPayload) {
  const timeZone = payload.time_zone ?? "Europe/Stockholm";
  return {
    summary: payload.title ?? "CRM meeting",
    description: payload.description ?? "",
    start: {
      dateTime: payload.starts_at,
      timeZone,
    },
    end: {
      dateTime: payload.ends_at,
      timeZone,
    },
    attendees: (payload.attendees ?? []).map((attendee) => ({
      email: attendee.email,
      displayName: attendee.name,
    })),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

function extractMeetLink(googleEvent: any): string | null {
  if (googleEvent?.hangoutLink) {
    return googleEvent.hangoutLink as string;
  }

  const entryPoints = googleEvent?.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find((entry: any) => entry.entryPointType === "video");
    if (video?.uri) {
      return video.uri as string;
    }
  }

  return null;
}

async function createGoogleEvent(payload: CalendarEventPayload) {
  const serviceAccount = normalizeServiceAccount();
  if (!serviceAccount || !GOOGLE_CALENDAR_ID) {
    return { google_event_id: null, meet_link: null };
  }

  const token = await getGoogleAccessToken(serviceAccount);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      GOOGLE_CALENDAR_ID,
    )}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGoogleEventBody(payload)),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to create Google event: ${details}`);
  }

  const googleEvent = await response.json();
  return {
    google_event_id: googleEvent.id as string,
    meet_link: extractMeetLink(googleEvent),
  };
}

async function updateGoogleEvent(
  googleEventId: string,
  payload: CalendarEventPayload,
  cancelOnly = false,
) {
  const serviceAccount = normalizeServiceAccount();
  if (!serviceAccount || !GOOGLE_CALENDAR_ID) {
    return { meet_link: payload.meet_link ?? null };
  }

  const token = await getGoogleAccessToken(serviceAccount);
  const body = cancelOnly
    ? { status: "cancelled" }
    : buildGoogleEventBody(payload);

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      GOOGLE_CALENDAR_ID,
    )}/events/${encodeURIComponent(googleEventId)}?conferenceDataVersion=1`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Failed to update Google event: ${details}`);
  }

  const googleEvent = await response.json();
  return {
    meet_link: extractMeetLink(googleEvent),
  };
}

async function getSaleIdByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("sales")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (error || !data?.id) {
    throw new Error("No sale found for current user");
  }

  return data.id as number;
}

async function createCalendarEvent(userId: string, payload: CalendarEventPayload) {
  const saleId = await getSaleIdByUserId(userId);
  const startsAt = normalizeIso(payload.starts_at);
  const endsAt = normalizeIso(payload.ends_at);
  if (!startsAt || !endsAt) {
    throw new Error("Missing starts_at or ends_at");
  }

  const payloadHash = await sha256Hex(
    JSON.stringify({
      title: payload.title,
      starts_at: startsAt,
      ends_at: endsAt,
      attendees: payload.attendees ?? [],
    }),
  );

  const googleData = await createGoogleEvent({
    ...payload,
    starts_at: startsAt,
    ends_at: endsAt,
  });

  const recordToInsert = {
    title: payload.title ?? "Meeting",
    description: payload.description ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    time_zone: payload.time_zone ?? "Europe/Stockholm",
    contact_id: payload.contact_id ?? null,
    company_id: payload.company_id ?? null,
    sales_id: payload.sales_id ?? saleId,
    status: payload.status ?? "scheduled",
    source: payload.source ?? "crm",
    google_event_id: googleData.google_event_id,
    calcom_event_id: payload.calcom_event_id ?? null,
    meeting_provider: payload.meeting_provider ?? "google_meet",
    meet_link: googleData.meet_link ?? payload.meet_link ?? null,
    attendees: payload.attendees ?? [],
    metadata: {
      ...(payload.metadata ?? {}),
      payload_hash: payloadHash,
      synced_at: new Date().toISOString(),
    },
  };

  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .insert(recordToInsert)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to insert calendar event");
  }

  return data;
}

async function updateCalendarEvent(
  id: number,
  payload: CalendarEventPayload,
  cancelOnly = false,
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("calendar_events")
    .select("*")
    .eq("id", id)
    .single();

  if (existingError || !existing) {
    throw new Error("Calendar event not found");
  }

  const startsAt = normalizeIso(payload.starts_at) ?? existing.starts_at;
  const endsAt = normalizeIso(payload.ends_at) ?? existing.ends_at;

  const payloadHash = await sha256Hex(
    JSON.stringify({
      id,
      title: payload.title ?? existing.title,
      starts_at: startsAt,
      ends_at: endsAt,
      status: cancelOnly ? "cancelled" : payload.status ?? existing.status,
      attendees: payload.attendees ?? existing.attendees ?? [],
    }),
  );

  let meetLink: string | null = existing.meet_link;
  if (existing.google_event_id) {
    const googleUpdate = await updateGoogleEvent(
      existing.google_event_id,
      {
        ...existing,
        ...payload,
        starts_at: startsAt,
        ends_at: endsAt,
      },
      cancelOnly,
    );
    meetLink = googleUpdate.meet_link ?? meetLink;
  }

  const updateRecord = {
    title: payload.title ?? existing.title,
    description: payload.description ?? existing.description,
    starts_at: startsAt,
    ends_at: endsAt,
    time_zone: payload.time_zone ?? existing.time_zone ?? "Europe/Stockholm",
    contact_id:
      payload.contact_id === undefined ? existing.contact_id : payload.contact_id,
    company_id:
      payload.company_id === undefined ? existing.company_id : payload.company_id,
    status: cancelOnly ? "cancelled" : payload.status ?? existing.status,
    meeting_provider: payload.meeting_provider ?? existing.meeting_provider,
    meet_link: payload.meet_link ?? meetLink,
    attendees: payload.attendees ?? existing.attendees ?? [],
    metadata: {
      ...(existing.metadata ?? {}),
      ...(payload.metadata ?? {}),
      payload_hash: payloadHash,
      synced_at: new Date().toISOString(),
    },
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .update(updateRecord)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update calendar event");
  }

  return data;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (!user) {
          return createErrorResponse(401, "Unauthorized");
        }
        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        try {
          const body = await req.json();
          const action = body.action as CalendarAction;
          const id = body.id as number | undefined;
          const payload = (body.data ?? {}) as CalendarEventPayload;

          if (action === "create") {
            const data = await createCalendarEvent(user.id, payload);
            return new Response(JSON.stringify({ data }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          if (action === "update") {
            if (!id) {
              return createErrorResponse(400, "Missing id for update action");
            }
            const data = await updateCalendarEvent(id, payload, false);
            return new Response(JSON.stringify({ data }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          if (action === "delete") {
            if (!id) {
              return createErrorResponse(400, "Missing id for delete action");
            }
            const data = await updateCalendarEvent(id, {}, true);
            return new Response(JSON.stringify({ data }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          return createErrorResponse(400, "Invalid action");
        } catch (error) {
          return createErrorResponse(
            500,
            error instanceof Error ? error.message : "Calendar sync failed",
          );
        }
      }),
    ),
  ),
);
