import { lorem, random } from "faker/locale/en_US";

import type { CalendarEvent } from "../../../types";
import type { Db } from "./types";
import { randomDate } from "./utils";

const statuses: Array<CalendarEvent["status"]> = [
  "scheduled",
  "scheduled",
  "scheduled",
  "completed",
  "cancelled",
];

export const generateCalendarEvents = (db: Db) => {
  return Array.from(Array(120).keys()).map<CalendarEvent>((id) => {
    const contact = random.arrayElement(db.contacts);
    const startsAt = randomDate(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    );
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const status = random.arrayElement(statuses);
    const hasMeetLink = status !== "cancelled" && random.arrayElement([true, true, false]);

    return {
      id,
      title: lorem.words(3),
      description: lorem.sentence(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      time_zone: "Europe/Stockholm",
      contact_id: contact.id,
      company_id: contact.company_id ?? null,
      sales_id: contact.sales_id ?? null,
      status,
      source: "crm",
      google_event_id: `demo_google_event_${id}`,
      calcom_event_id: null,
      meeting_provider: "google_meet",
      meet_link: hasMeetLink ? `https://meet.google.com/demo-${id}` : null,
      attendees: contact.email_jsonb?.length
        ? contact.email_jsonb.map((email) => ({ email: email.email }))
        : [],
      metadata: {
        generated: true,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });
};
