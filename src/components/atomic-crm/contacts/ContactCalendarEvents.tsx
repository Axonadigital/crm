import { useMemo } from "react";
import { useRecordContext, useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
import { CalendarAgenda } from "../calendar/CalendarAgenda";
import { useGetList } from "ra-core";
import type { CalendarEvent } from "../calendar/types";
import type { Contact } from "../types";

const isUpcoming = (event: CalendarEvent) => {
  if (event.status === "cancelled") return false;
  return new Date(event.starts_at).getTime() >= Date.now();
};

export const ContactCalendarEvents = () => {
  const record = useRecordContext<Contact>();
  const translate = useTranslate();

  if (!record) {
    return null;
  }

  const { data: events, isPending } = useGetList<CalendarEvent>(
    "calendar_events",
    {
      pagination: { page: 1, perPage: 20 },
      sort: { field: "starts_at", order: "ASC" },
      filter: {
        contact_id: record.id,
      },
    },
    { enabled: !!record },
  );

  const upcomingEvents = useMemo(() => {
    return (events || []).filter(isUpcoming);
  }, [events]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {translate("resources.calendar_events.list.contact_description")}
      </p>
      <CalendarAgenda
        events={upcomingEvents}
        isPending={isPending}
        emptyLabel={translate("resources.calendar_events.empty", {
          _: "No meetings yet",
        })}
        compact
      />
      <Button variant="outline" asChild>
        <Link to={`/calendar?contact_id=${record.id}`}>
          {translate("resources.calendar_events.action.add")}
        </Link>
      </Button>
    </div>
  );
};
