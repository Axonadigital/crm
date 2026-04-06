import { useEffect, useMemo, useState } from "react";
import {
  Identifier,
  useGetIdentity,
  useGetList,
  useNotify,
  useTranslate,
} from "ra-core";
import { Link, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SaveButton } from "@/components/admin/form";
import { CalendarAgenda } from "./CalendarAgenda";
import { CalendarWeekView } from "./CalendarWeekView";
import { CalendarForm } from "./CalendarForm";
import { Form, CreateBase } from "ra-core";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { CalendarEvent } from "./types";

const GOOGLE_EMBED_TIMEOUT_MS = 8000;

const filterByStatus = (
  event: CalendarEvent,
  mode: "today" | "upcoming" | "cancelled" | "all",
) => {
  const now = new Date();
  const eventStarts = new Date(event.starts_at);
  if (mode === "cancelled") {
    return event.status === "cancelled";
  }
  if (event.status === "cancelled") {
    return false;
  }
  if (mode === "all") {
    return true;
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextWeek = new Date(todayStart);
  nextWeek.setDate(nextWeek.getDate() + 7);

  if (mode === "today") {
    return eventStarts >= todayStart && eventStarts < new Date(todayStart.getTime() + 86400000);
  }

  return eventStarts >= now && eventStarts < nextWeek;
};

export const CalendarList = () => {
  const translate = useTranslate();
  const notify = useNotify();
  const { identity } = useGetIdentity();
  const [searchParams] = useSearchParams();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<"today" | "upcoming" | "cancelled" | "all">(
    "upcoming",
  );
  const [viewMode, setViewMode] = useState<"agenda" | "week">("agenda");
  const googleCalendarEmbedUrl = import.meta.env.VITE_GOOGLE_CALENDAR_EMBED_URL;
  const [calendarMode, setCalendarMode] = useState<"google" | "crm">(
    "crm",
  );
  const [googleEmbedLoaded, setGoogleEmbedLoaded] = useState(false);
  const [googleEmbedFailed, setGoogleEmbedFailed] = useState(false);

  const filterContactId = searchParams.get("contact_id");

  useEffect(() => {
    if (calendarMode !== "google" || !googleCalendarEmbedUrl) {
      setGoogleEmbedLoaded(false);
      setGoogleEmbedFailed(false);
      return;
    }

    setGoogleEmbedLoaded(false);
    setGoogleEmbedFailed(false);

    const timeoutId = window.setTimeout(() => {
      setGoogleEmbedFailed(true);
    }, GOOGLE_EMBED_TIMEOUT_MS);

    return () => window.clearTimeout(timeoutId);
  }, [calendarMode, googleCalendarEmbedUrl]);

  const { data: calendarEvents, isPending } = useGetList<CalendarEvent>(
    "calendar_events",
    {
      pagination: { page: 1, perPage: 200 },
      sort: { field: "starts_at", order: "ASC" },
      filter: {
        ...(filterContactId != null
          ? { contact_id: Number(filterContactId) as Identifier }
          : identity?.id != null
            ? { sales_id: identity.id }
            : {}),
      },
    },
    {
      enabled:
        filterContactId != null
          ? true
          : identity != null,
    },
  );

  const filteredEvents = useMemo(
    () => (calendarEvents || []).filter((event) => filterByStatus(event, filterMode)),
    [calendarEvents, filterMode],
  );

  const defaultRecord = {
    status: "scheduled" as const,
    meeting_provider: "google_meet" as const,
    source: "crm",
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ...(filterContactId ? { contact_id: Number(filterContactId) as Identifier } : {}),
  };

  const parseAttendees = (value: string | undefined) =>
    (value || "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean)
      .map((email) => ({ email }));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {translate("resources.calendar_events.name", { smart_count: 2 })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translate("resources.calendar_events.list.description")}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="sm:w-auto">
          {translate("resources.calendar_events.action.create")}
        </Button>
      </div>

      {googleCalendarEmbedUrl ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <Button
            size="sm"
            variant={calendarMode === "google" ? "default" : "outline"}
            onClick={() => setCalendarMode("google")}
          >
            {translate("resources.calendar_events.modes.google")}
          </Button>
          <Button
            size="sm"
            variant={calendarMode === "crm" ? "default" : "outline"}
            onClick={() => setCalendarMode("crm")}
          >
            {translate("resources.calendar_events.modes.crm")}
          </Button>
        </div>
      ) : null}

      {calendarMode === "google" && googleCalendarEmbedUrl ? (
        <Card>
          <CardHeader>
            {translate("resources.calendar_events.embed.title")}
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {translate("resources.calendar_events.embed.description")}
            </p>
            {googleEmbedFailed ? (
              <div className="rounded-lg border bg-background p-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Google Calendar could not be embedded here. This usually means the
                  embed URL is invalid, the calendar is not embeddable, or the browser
                  is blocking the Google session inside the iframe.
                </p>
                <Button asChild>
                  <a
                    href={googleCalendarEmbedUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Google Calendar
                  </a>
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border bg-background">
                {!googleEmbedLoaded ? (
                  <div className="flex h-[72vh] min-h-[720px] items-center justify-center text-sm text-muted-foreground">
                    Loading Google Calendar...
                  </div>
                ) : null}
                <iframe
                  src={googleCalendarEmbedUrl}
                  title={translate("resources.calendar_events.embed.title")}
                  className="h-[72vh] min-h-[720px] w-full"
                  onLoad={() => {
                    setGoogleEmbedLoaded(true);
                    setGoogleEmbedFailed(false);
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {calendarMode === "crm" ? (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            <Button
              size="sm"
              variant={filterMode === "today" ? "default" : "outline"}
              onClick={() => setFilterMode("today")}
            >
              {translate("resources.calendar_events.filters.today")}
            </Button>
            <Button
              size="sm"
              variant={filterMode === "upcoming" ? "default" : "outline"}
              onClick={() => setFilterMode("upcoming")}
            >
              {translate("resources.calendar_events.filters.upcoming")}
            </Button>
            <Button
              size="sm"
              variant={filterMode === "cancelled" ? "default" : "outline"}
              onClick={() => setFilterMode("cancelled")}
            >
              {translate("resources.calendar_events.filters.cancelled")}
            </Button>
            <Button
              size="sm"
              variant={filterMode === "all" ? "default" : "outline"}
              onClick={() => setFilterMode("all")}
            >
              {translate("resources.calendar_events.filters.all")}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <Button
              size="sm"
              variant={viewMode === "agenda" ? "default" : "outline"}
              onClick={() => setViewMode("agenda")}
            >
              {translate("resources.calendar_events.views.agenda")}
            </Button>
            <Button
              size="sm"
              variant={viewMode === "week" ? "default" : "outline"}
              onClick={() => setViewMode("week")}
            >
              {translate("resources.calendar_events.views.week")}
            </Button>
          </div>

          <Card>
            <CardHeader>{translate("crm.dashboard.upcoming_meetings")}</CardHeader>
            <CardContent>
              {viewMode === "agenda" ? (
                <CalendarAgenda events={filteredEvents} isPending={isPending} />
              ) : (
                <CalendarWeekView events={filteredEvents} />
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="lg:max-w-xl overflow-y-auto max-h-9/10 top-1/20 translate-y-0">
          <DialogHeader>
            <DialogTitle>
              {translate("resources.calendar_events.action.create")}
            </DialogTitle>
          </DialogHeader>
          <CreateBase resource="calendar_events" redirect={false} record={defaultRecord}>
            <Form className="space-y-4">
              <CalendarForm />
              <DialogFooter>
                <SaveButton
                  type="submit"
                  label={translate("resources.calendar_events.action.create")}
                  transform={(data: any) => {
                    const attendees = parseAttendees(data.attendee_emails);
                    return {
                      ...data,
                      status: data.status || "scheduled",
                      source: "crm",
                      meeting_provider: data.meeting_provider || "google_meet",
                      time_zone:
                        data.time_zone ||
                        Intl.DateTimeFormat().resolvedOptions().timeZone ||
                        "Europe/Stockholm",
                      starts_at: new Date(data.starts_at).toISOString(),
                      ends_at: new Date(data.ends_at).toISOString(),
                      attendees,
                      metadata: {
                        created_from: "calendar_page",
                      },
                    };
                  }}
                  mutationOptions={{
                    onSuccess: () => {
                      setIsCreateOpen(false);
                      notify("resources.calendar_events.added");
                    },
                  }}
                />
              </DialogFooter>
            </Form>
          </CreateBase>
        </DialogContent>
      </Dialog>

      {filterContactId ? (
        <Button asChild variant="ghost" size="sm" className="px-0">
          <Link to="/calendar">{translate("resources.calendar_events.action.create_new")}</Link>
        </Button>
      ) : null}
    </div>
  );
};
