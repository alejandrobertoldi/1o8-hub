import type { calendar_v3 } from "googleapis";

/**
 * Pure mapping between time off and the shared "1o8 Time off (PTO/OOO/Sick)"
 * Google Calendar. Events the hub publishes carry `hubTimeOffId` in their
 * private extended properties, so reading the calendar back never imports
 * them twice.
 */

export const HUB_TIME_OFF_PROP = "hubTimeOffId";

const DAY = 86_400_000;
export const addDaysIso = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export type PublishableTimeOff = {
  id: string;
  userName: string | null;
  startDate: string;
  endDate: string;
  source: string;
  kind: string | null;
};

export function timeOffLabel(kind: string | null): string {
  if (kind === "sick") return "Sick";
  return "PTO";
}

/** All-day event (Google's end date is exclusive), free so it doesn't block calendars. */
export function eventForTimeOff(r: PublishableTimeOff): calendar_v3.Schema$Event {
  return {
    summary: `${r.userName ?? "Team member"} ${timeOffLabel(r.kind)}`,
    description: r.source === "gusto" ? "Approved in Gusto · synced by the 1o8 Hub" : "Approved in the 1o8 Hub",
    start: { date: r.startDate },
    end: { date: addDaysIso(r.endDate, 1) },
    transparency: "transparent",
    extendedProperties: { private: { [HUB_TIME_OFF_PROP]: r.id } },
  };
}

export type TeamCalendarEvent = {
  googleEventId: string;
  summary: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startAt: Date | null;
  endAt: Date | null;
  timeZone: string | null;
  creatorEmail: string | null;
};

/** YYYY-MM-DD of an instant in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/**
 * An event someone put on the calendar directly, or null for events the hub
 * published itself, cancelled events and events without dates.
 */
export function teamEventFromGoogle(e: calendar_v3.Schema$Event, calendarTimeZone: string): TeamCalendarEvent | null {
  if (!e.id || e.status === "cancelled") return null;
  if (e.extendedProperties?.private?.[HUB_TIME_OFF_PROP]) return null;
  const base = { googleEventId: e.id, summary: e.summary?.trim() || "Busy", creatorEmail: e.creator?.email?.toLowerCase() ?? null };
  if (e.start?.date) {
    const end = e.end?.date ? addDaysIso(e.end.date, -1) : e.start.date;
    return { ...base, allDay: true, startDate: e.start.date, endDate: end < e.start.date ? e.start.date : end, startAt: null, endAt: null, timeZone: null };
  }
  if (!e.start?.dateTime) return null;
  const tz = e.start.timeZone || calendarTimeZone;
  const startAt = new Date(e.start.dateTime);
  const endAt = e.end?.dateTime ? new Date(e.end.dateTime) : startAt;
  // An event ending exactly at midnight doesn't cover the next day.
  const endDate = localDate(new Date(Math.max(startAt.getTime(), endAt.getTime() - 1)), tz);
  return { ...base, allDay: false, startDate: localDate(startAt, tz), endDate, startAt, endAt, timeZone: tz };
}

/** "10:00–11:00 AM" in the event's zone, for part-day chips. */
export function timeRangeLabel(startAt: Date, endAt: Date, timeZone: string | null): string {
  const f = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? undefined });
  return `${f(startAt)}–${f(endAt)}`;
}
