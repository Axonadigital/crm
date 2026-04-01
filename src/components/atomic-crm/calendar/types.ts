import type { Identifier } from "ra-core";
import type { RaRecord } from "ra-core";

export type CalendarEventStatus = "scheduled" | "completed" | "cancelled";

export type CalendarEventSource = "crm" | "calcom" | "google";

export type CalendarMeetingProvider = "google_meet";

export type CalendarEventAttendee = {
  name?: string;
  email: string;
};

export type CalendarEvent = {
  id: Identifier;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  time_zone?: string;
  contact_id?: Identifier | null;
  company_id?: Identifier | null;
  sales_id?: Identifier | null;
  status: CalendarEventStatus;
  source: CalendarEventSource;
  google_event_id?: string | null;
  calcom_event_id?: string | null;
  meeting_provider: CalendarMeetingProvider;
  meet_link?: string | null;
  attendees?: CalendarEventAttendee[];
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type CalendarEventInput = Omit<CalendarEvent, "id" | "created_at" | "updated_at"> &
  Partial<Pick<CalendarEvent, "id" | "created_at" | "updated_at">>;

export type CalendarEventRecord = CalendarEvent & RaRecord;
