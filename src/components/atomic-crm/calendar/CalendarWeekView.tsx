import { useState } from "react";
import { GripVertical, Minus, Plus } from "lucide-react";
import { useNotify, useTranslate, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "./types";

const getWeekStart = (date: Date) => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const formatDay = (date: Date) =>
  date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

const moveEventToDate = (event: CalendarEvent, targetDate: Date) => {
  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);
  const durationMs = endsAt.getTime() - startsAt.getTime();

  const nextStart = new Date(targetDate);
  nextStart.setHours(
    startsAt.getHours(),
    startsAt.getMinutes(),
    startsAt.getSeconds(),
    startsAt.getMilliseconds(),
  );

  return {
    starts_at: nextStart.toISOString(),
    ends_at: new Date(nextStart.getTime() + durationMs).toISOString(),
  };
};

const resizeEvent = (event: CalendarEvent, minutesDelta: number) => {
  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);
  const nextEndsAt = new Date(endsAt.getTime() + minutesDelta * 60 * 1000);
  const minimumEndsAt = new Date(startsAt.getTime() + 15 * 60 * 1000);

  return {
    ends_at:
      nextEndsAt.getTime() <= minimumEndsAt.getTime()
        ? minimumEndsAt.toISOString()
        : nextEndsAt.toISOString(),
  };
};

export const CalendarWeekView = ({ events }: { events: CalendarEvent[] }) => {
  const translate = useTranslate();
  const notify = useNotify();
  const [update] = useUpdate();
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const now = new Date();
  const weekStart = getWeekStart(now);

  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    date.setHours(0, 0, 0, 0);

    const dayEvents = events
      .filter((event) => {
        const startsAt = new Date(event.starts_at);
        return (
          startsAt.getFullYear() === date.getFullYear() &&
          startsAt.getMonth() === date.getMonth() &&
          startsAt.getDate() === date.getDate()
        );
      })
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );

    return { date, events: dayEvents };
  });

  const handleDrop = (targetDate: Date) => {
    if (!draggedEventId) {
      return;
    }

    const event = events.find((item) => String(item.id) === draggedEventId);
    setDraggedEventId(null);
    setDropTarget(null);

    if (!event) {
      return;
    }

    update(
      "calendar_events",
      {
        id: event.id,
        data: moveEventToDate(event, targetDate),
        previousData: event,
      },
      {
        onSuccess: () => {
          notify("resources.calendar_events.notifications.moved", {
            messageArgs: { title: event.title },
          });
        },
      },
    );
  };

  const handleResize = (event: CalendarEvent, minutesDelta: number) => {
    update(
      "calendar_events",
      {
        id: event.id,
        data: resizeEvent(event, minutesDelta),
        previousData: event,
      },
      {
        onSuccess: () => {
          notify("resources.calendar_events.notifications.resized", {
            messageArgs: { title: event.title },
          });
        },
      },
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
      {days.map((day) => (
        <section
          key={day.date.toISOString()}
          className={cn(
            "rounded-md border p-3 transition-colors",
            dropTarget === day.date.toISOString()
              ? "border-primary bg-primary/5"
              : "border-border",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(day.date.toISOString());
          }}
          onDragLeave={() => {
            setDropTarget((current) =>
              current === day.date.toISOString() ? null : current,
            );
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleDrop(day.date);
          }}
        >
          <h3 className="text-sm font-semibold mb-2">{formatDay(day.date)}</h3>
          <div className="space-y-2">
            {day.events.length ? (
              day.events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-sm bg-muted/60 p-2 cursor-move"
                  draggable
                  onDragStart={() => {
                    setDraggedEventId(String(event.id));
                  }}
                  onDragEnd={() => {
                    setDraggedEventId(null);
                    setDropTarget(null);
                  }}
                >
                  <div className="flex items-start gap-2">
                    <GripVertical className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {formatTime(event.starts_at)}-{formatTime(event.ends_at)}
                      </p>
                      <p className="text-sm font-medium truncate">{event.title}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleResize(event, -15)}
                    >
                      <Minus className="size-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleResize(event, 15)}
                    >
                      <Plus className="size-3" />
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      {translate("resources.calendar_events.actions.drag_to_move")}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                {translate("resources.calendar_events.empty_list")}
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
};
