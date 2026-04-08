import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import * as jose from "jsr:@panva/jose@6";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";

type CalendarAction = "create" | "update" | "delete";

const VALID_ACTIONS: CalendarAction[] = ["create", "update", "delete"];
const VALID_STATUSES = ["scheduled", "completed", "cancelled"] as const;
const VALID_SOURCES = ["crm", "calcom", "google"] as const;
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_ATTENDEES = 100;
const MAX_TIMEZONE_LENGTH = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// --- Input Validation ---

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || value === undefined || isPositiveInteger(value);
}

function isValidDatetime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function validatePayload(
  payload: Record<string, unknown>,
  requireDates: boolean,
):
  | { valid: true; data: CalendarEventPayload }
  | { valid: false; error: string } {
  if (payload.title !== undefined && payload.title !== null) {
    if (typeof payload.title !== "string") {
      return { valid: false, error: "title must be a string" };
    }
    if (payload.title.length > MAX_TITLE_LENGTH) {
      return {
        valid: false,
        error: `title must be at most ${MAX_TITLE_LENGTH} characters`,
      };
    }
  }

  if (payload.description !== undefined && payload.description !== null) {
    if (typeof payload.description !== "string") {
      return { valid: false, error: "description must be a string" };
    }
    if (payload.description.length > MAX_DESCRIPTION_LENGTH) {
      return {
        valid: false,
        error: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      };
    }
  }

  if (requireDates) {
    if (!payload.starts_at || !isValidDatetime(payload.starts_at)) {
      return {
        valid: false,
        error: "starts_at is required and must be a valid ISO datetime",
      };
    }
    if (!payload.ends_at || !isValidDatetime(payload.ends_at)) {
      return {
        valid: false,
        error: "ends_at is required and must be a valid ISO datetime",
      };
    }
    if (
      new Date(payload.starts_at as string) >=
      new Date(payload.ends_at as string)
    ) {
      return { valid: false, error: "starts_at must be before ends_at" };
    }
  } else {
    if (
      payload.starts_at !== undefined &&
      !isValidDatetime(payload.starts_at)
    ) {
      return {
        valid: false,
        error: "starts_at must be a valid ISO datetime",
      };
    }
    if (payload.ends_at !== undefined && !isValidDatetime(payload.ends_at)) {
      return {
        valid: false,
        error: "ends_at must be a valid ISO datetime",
      };
    }
    if (
      payload.starts_at &&
      payload.ends_at &&
      new Date(payload.starts_at as string) >=
        new Date(payload.ends_at as string)
    ) {
      return { valid: false, error: "starts_at must be before ends_at" };
    }
  }

  if (payload.time_zone !== undefined && payload.time_zone !== null) {
    if (
      typeof payload.time_zone !== "string" ||
      payload.time_zone.length > MAX_TIMEZONE_LENGTH
    ) {
      return { valid: false, error: "time_zone must be a valid string" };
    }
  }

  if (!isNullablePositiveInteger(payload.contact_id)) {
    return {
      valid: false,
      error: "contact_id must be a positive integer or null",
    };
  }
  if (!isNullablePositiveInteger(payload.company_id)) {
    return {
      valid: false,
      error: "company_id must be a positive integer or null",
    };
  }
  if (!isNullablePositiveInteger(payload.sales_id)) {
    return {
      valid: false,
      error: "sales_id must be a positive integer or null",
    };
  }

  if (payload.status !== undefined && payload.status !== null) {
    if (
      !(VALID_STATUSES as readonly string[]).includes(payload.status as string)
    ) {
      return {
        valid: false,
        error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
      };
    }
  }

  if (payload.source !== undefined && payload.source !== null) {
    if (
      !(VALID_SOURCES as readonly string[]).includes(payload.source as string)
    ) {
      return {
        valid: false,
        error: `source must be one of: ${VALID_SOURCES.join(", ")}`,
      };
    }
  }

  if (payload.attendees !== undefined && payload.attendees !== null) {
    if (!Array.isArray(payload.attendees)) {
      return { valid: false, error: "attendees must be an array" };
    }
    if (payload.attendees.length > MAX_ATTENDEES) {
      return {
        valid: false,
        error: `attendees must have at most ${MAX_ATTENDEES} entries`,
      };
    }
    for (let i = 0; i < payload.attendees.length; i++) {
      const attendee = payload.attendees[i];
      if (!attendee || typeof attendee !== "object") {
        return { valid: false, error: `attendees[${i}] must be an object` };
      }
      if (
        typeof attendee.email !== "string" ||
        !EMAIL_REGEX.test(attendee.email)
      ) {
        return {
          valid: false,
          error: `attendees[${i}].email must be a valid email address`,
        };
      }
      if (
        attendee.name !== undefined &&
        attendee.name !== null &&
        typeof attendee.name !== "string"
      ) {
        return {
          valid: false,
          error: `attendees[${i}].name must be a string`,
        };
      }
    }
  }

  if (payload.meet_link !== undefined && payload.meet_link !== null) {
    if (typeof payload.meet_link !== "string") {
      return { valid: false, error: "meet_link must be a string" };
    }
  }

  if (payload.metadata !== undefined && payload.metadata !== null) {
    if (
      typeof payload.metadata !== "object" ||
      Array.isArray(payload.metadata)
    ) {
      return { valid: false, error: "metadata must be an object or null" };
    }
  }

  return { valid: true, data: payload as CalendarEventPayload };
}

// --- Google Calendar Helpers ---

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
  const parsed = JSON.parse(
    GOOGLE_SERVICE_ACCOUNT_JSON,
  ) as ServiceAccountConfig;
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
  const privateKey = await jose.importPKCS8(
    serviceAccount.private_key,
    "RS256",
  );
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
    const video = entryPoints.find(
      (entry: any) => entry.entryPointType === "video",
    );
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

// --- CRM Calendar Event CRUD ---

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

async function createCalendarEvent(
  userId: string,
  payload: CalendarEventPayload,
) {
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
      status: cancelOnly ? "cancelled" : (payload.status ?? existing.status),
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
      payload.contact_id === undefined
        ? existing.contact_id
        : payload.contact_id,
    company_id:
      payload.company_id === undefined
        ? existing.company_id
        : payload.company_id,
    status: cancelOnly ? "cancelled" : (payload.status ?? existing.status),
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

// --- Main Handler ---

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
          let body: Record<string, unknown>;
          try {
            body = await req.json();
          } catch {
            return createErrorResponse(400, "Invalid JSON body");
          }

          if (
            typeof body !== "object" ||
            body === null ||
            Array.isArray(body)
          ) {
            return createErrorResponse(
              400,
              "Request body must be a JSON object",
            );
          }

          const action = body.action;
          if (
            typeof action !== "string" ||
            !(VALID_ACTIONS as readonly string[]).includes(action)
          ) {
            return createErrorResponse(
              400,
              `action must be one of: ${VALID_ACTIONS.join(", ")}`,
            );
          }

          const id = body.id;
          const rawPayload =
            body.data !== undefined && body.data !== null ? body.data : {};

          if (typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
            return createErrorResponse(400, "data must be a JSON object");
          }

          if (action === "create") {
            const validation = validatePayload(
              rawPayload as Record<string, unknown>,
              true,
            );
            if (!validation.valid) {
              return createErrorResponse(400, validation.error);
            }
            const data = await createCalendarEvent(user.id, validation.data);
            return new Response(JSON.stringify({ data }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          if (action === "update") {
            if (!isPositiveInteger(id)) {
              return createErrorResponse(
                400,
                "id must be a positive integer for update action",
              );
            }
            const validation = validatePayload(
              rawPayload as Record<string, unknown>,
              false,
            );
            if (!validation.valid) {
              return createErrorResponse(400, validation.error);
            }
            const data = await updateCalendarEvent(id, validation.data, false);
            return new Response(JSON.stringify({ data }), {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            });
          }

          if (action === "delete") {
            if (!isPositiveInteger(id)) {
              return createErrorResponse(
                400,
                "id must be a positive integer for delete action",
              );
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
