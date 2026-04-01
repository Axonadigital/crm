import { CalendarDays } from "lucide-react";
import { useGetList, useTranslate } from "ra-core";
import { Card } from "@/components/ui/card";

import { CalendarAgenda } from "../calendar/CalendarAgenda";
import type { CalendarEvent } from "../calendar/types";

const isUpcoming = (event: CalendarEvent) => {
  if (event.status === "cancelled") {
    return false;
  }
  return new Date(event.starts_at).getTime() >= Date.now();
};

export const UpcomingMeetings = () => {
  const translate = useTranslate();
  const { data, isPending } = useGetList<CalendarEvent>("calendar_events", {
    pagination: { page: 1, perPage: 10 },
    sort: { field: "starts_at", order: "ASC" },
  });

  const events = (data ?? []).filter(isUpcoming);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center">
        <div className="mr-3 flex">
          <CalendarDays className="text-muted-foreground w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-muted-foreground flex-1">
          {translate("crm.dashboard.upcoming_meetings")}
        </h2>
      </div>
      <Card className="p-4 mb-2">
        <CalendarAgenda events={events} isPending={isPending} compact />
      </Card>
    </div>
  );
};
