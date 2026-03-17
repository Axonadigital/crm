import { CalendarClock, CalendarDays, Link as LinkIcon, Video } from "lucide-react";
import { Link } from "react-router";
import {
  useGetIdentity,
  useListContext,
  useNotify,
  useTranslate,
  useUpdate,
  type Identifier,
} from "ra-core";
import type { ReactNode } from "react";

import { useIsMobile } from "@/hooks/use-mobile";
import { DateField } from "@/components/admin/date-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import type { CalendarEvent, CalendarEventStatus } from "./types";

const statusVariant: Record<
  CalendarEventStatus,
  "default" | "secondary" | "outline"
> = {
  scheduled: "default",
  completed: "secondary",
  cancelled: "outline",
};

const statusLabel: Record<CalendarEventStatus, string> = {
  scheduled: "scheduled",
  completed: "completed",
  cancelled: "cancelled",
};

export const CalendarAgenda = ({
  events,
  isPending,
  emptyLabel,
  compact,
}: {
  events: CalendarEvent[];
  isPending?: boolean;
  emptyLabel?: ReactNode;
  compact?: boolean;
}) => {
  const translate = useTranslate();
  const isMobile = useIsMobile();

  const groupedByDay = events.reduce<Record<string, CalendarEvent[]>>(
    (acc, event) => {
      const key = new Date(event.starts_at).toLocaleDateString();
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    },
    {},
  );

  if (isPending) {
    return <Skeleton className="h-28" />;
  }

  if (!events.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyLabel ||
          translate("resources.calendar_events.empty_list", {
            _: "No meetings found",
          })}
      </p>
    );
  }

  const days = Object.keys(groupedByDay);

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <section key={day}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {new Date(day).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </h2>
          <div className="space-y-3">
            {groupedByDay[day].map((event) => (
              <CalendarAgendaItem
                event={event as CalendarEvent}
                key={event.id}
                compact={compact}
                isMobile={isMobile}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

const CalendarAgendaItem = ({
  event,
  compact,
  isMobile,
}: {
  event: CalendarEvent;
  compact?: boolean;
  isMobile: boolean;
}) => {
  const translate = useTranslate();
  const notify = useNotify();
  const [update] = useUpdate();
  const { identity } = useGetIdentity();

  const attendeeText = event.attendees?.length
    ? event.attendees
        .map((attendee) => attendee.name || attendee.email)
        .join(", ")
    : null;

  const handleToggleCompleted = () => {
    if (identity?.id == null) return;

    const nextStatus = event.status === "completed" ? "scheduled" : "completed";

    update("calendar_events", {
      id: event.id,
      data: {
        status: nextStatus,
      },
      previousData: event,
      meta: { showNotification: false },
      mutationOptions: {
        onSuccess: () => {
          notify(
            nextStatus === "completed"
              ? "resources.calendar_events.notifications.completed"
              : "resources.calendar_events.notifications.reopened",
            {
              messageArgs: { title: event.title },
            },
          );
        },
      },
    });
  };

  const handleCancel = () => {
    if (identity?.id == null) return;

    update("calendar_events", {
      id: event.id,
      data: {
        status: event.status === "cancelled" ? "scheduled" : "cancelled",
      },
      previousData: event,
      meta: { showNotification: false },
      mutationOptions: {
        onSuccess: () => {
          notify("resources.calendar_events.notifications.updated", {
            messageArgs: { title: event.title },
          });
        },
      },
    });
  };

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{event.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <CalendarClock className="size-3" />
              <span>
                <DateField source="starts_at" record={event} showDate showTime />
              </span>
            </p>
          </div>
          <Badge
            variant={statusVariant[event.status ?? "scheduled"]}
            className="rounded-full shrink-0"
          >
            {translate(
              `resources.calendar_events.status.${statusLabel[event.status ?? "scheduled"]}`,
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="px-4 py-3">
        <div className="space-y-3">
          {event.description ? (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {event.description}
            </p>
          ) : null}

          {event.contact_id ? (
            <p className="text-sm">
              <CalendarDays className="size-4 inline mr-2" />
                <Link to={`/contacts/${event.contact_id}`} className="underline">
                  {translate("resources.calendar_events.fields.contact_id")}
                </Link>
            </p>
          ) : null}

          {attendeeText ? (
            <p className="text-sm text-muted-foreground">
              {translate("resources.calendar_events.fields.attendees")}: {attendeeText}
            </p>
          ) : null}

          {event.source && (
            <p className="text-xs text-muted-foreground">
              {translate("resources.calendar_events.fields.source")}: {event.source}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {event.meet_link ? (
              <Button variant="outline" size="sm" asChild>
                <a href={event.meet_link} target="_blank" rel="noreferrer" className="inline-flex items-center">
                  <Video className="size-4 mr-2" />
                  {translate("resources.calendar_events.actions.join_meeting")}
                </a>
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleCompleted}
              className="h-8"
            >
              {event.status === "completed"
                ? translate("resources.calendar_events.actions.mark_scheduled")
                : translate("resources.calendar_events.actions.toggle_complete")}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-8"
            >
              {event.status === "cancelled"
                ? translate("resources.calendar_events.actions.reopen")
                : translate("resources.calendar_events.actions.cancel")}
            </Button>

            {!compact ? (
              <a
                className="text-xs text-muted-foreground inline-flex items-center gap-1"
                href={
                  event.meeting_provider === "google_meet" && event.meet_link
                    ? event.meet_link
                    : undefined
                }
                target={
                  event.meeting_provider === "google_meet" && event.meet_link
                  ? "_blank"
                  : undefined
                }
                rel="noreferrer"
              >
                <LinkIcon className="size-3" />
                {event.meet_link
                  ? translate("resources.calendar_events.actions.open_link")
                  : translate("resources.calendar_events.actions.no_link")}
              </a>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const CalendarIterator = ({
  compact,
}: {
  compact?: boolean;
}) => {
  const { data, isPending, error } = useListContext<CalendarEvent, Identifier>();

  if (error) {
    return null;
  }

  return (
    <CalendarAgenda
      events={data || []}
      isPending={isPending}
      compact={compact}
    />
  );
};
