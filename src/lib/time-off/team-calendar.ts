import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray } from "drizzle-orm";
import { google, type calendar_v3 } from "googleapis";
import { db } from "@/lib/db";
import { teamCalendarEvents, timeOffRequests, users } from "@/lib/db/schema";
import { googleServiceAccount } from "@/lib/google-service-account";
import { addDaysIso, eventForTimeOff, teamEventFromGoogle } from "./calendar-events";

/**
 * The shared "1o8 Time off (PTO/OOO/Sick)" Google Calendar, as the hub's
 * service account (the calendar must be shared with it with "Make changes to
 * events"). TIME_OFF_CALENDAR_ID is the calendar's id.
 *
 * - Approved time off (booked in the hub or mirrored from Gusto) is published
 *   there, and removed when it's cancelled or denied.
 * - Everything else on it (people adding their own PTO / unavailable blocks)
 *   is read into team_calendar_events for the hub.
 */

export const teamCalendarId = () => process.env.TIME_OFF_CALENDAR_ID?.trim() || "";
export const teamCalendarConfigured = () => !!teamCalendarId() && !!googleServiceAccount();
const CALENDAR_TZ = () => process.env.TIME_OFF_CALENDAR_TZ || "America/Chicago";

let client: calendar_v3.Calendar | null = null;
function calendar(): calendar_v3.Calendar {
  if (client) return client;
  const sa = googleServiceAccount();
  if (!sa) throw new Error("No Google service account configured");
  const auth = new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/calendar.events"] });
  client = google.calendar({ version: "v3", auth });
  return client;
}

const gone = (err: unknown) => {
  const code = (err as { code?: number; status?: number })?.code ?? (err as { status?: number })?.status;
  return code === 404 || code === 410;
};

/**
 * Brings one request's calendar event in line with its status: approved →
 * create or update the event; anything else → remove it. Never throws (the
 * calendar is a mirror; the daily reconcile retries).
 */
export async function publishTimeOff(requestId: string): Promise<void> {
  if (!teamCalendarConfigured()) return;
  try {
    const [r] = await db
      .select({
        id: timeOffRequests.id,
        status: timeOffRequests.status,
        startDate: timeOffRequests.startDate,
        endDate: timeOffRequests.endDate,
        source: timeOffRequests.source,
        kind: timeOffRequests.kind,
        googleEventId: timeOffRequests.googleEventId,
        userName: users.name,
      })
      .from(timeOffRequests)
      .innerJoin(users, eq(users.id, timeOffRequests.userId))
      .where(eq(timeOffRequests.id, requestId))
      .limit(1);
    if (!r) return;
    const calendarId = teamCalendarId();

    if (r.status !== "approved") {
      if (!r.googleEventId) return;
      await calendar()
        .events.delete({ calendarId, eventId: r.googleEventId })
        .catch((err) => {
          if (!gone(err)) throw err;
        });
      await db.update(timeOffRequests).set({ googleEventId: null }).where(eq(timeOffRequests.id, r.id));
      return;
    }

    const requestBody = eventForTimeOff(r);
    if (r.googleEventId) {
      try {
        await calendar().events.patch({ calendarId, eventId: r.googleEventId, requestBody });
        return;
      } catch (err) {
        if (!gone(err)) throw err;
      }
    }
    const created = await calendar().events.insert({ calendarId, requestBody });
    if (created.data.id) await db.update(timeOffRequests).set({ googleEventId: created.data.id }).where(eq(timeOffRequests.id, r.id));
  } catch (err) {
    console.error(`[time-off] calendar publish failed for ${requestId}:`, err instanceof Error ? err.message : err);
  }
}

/** Daily backstop: publish approved time off that isn't on the calendar yet, remove what no longer is. */
export async function reconcileTimeOffEvents(today: string): Promise<{ published: number; removed: number }> {
  if (!teamCalendarConfigured()) return { published: 0, removed: 0 };
  const from = addDaysIso(today, -30);
  const [toPublish, stale] = await Promise.all([
    db
      .select({ id: timeOffRequests.id })
      .from(timeOffRequests)
      .where(and(eq(timeOffRequests.status, "approved"), gte(timeOffRequests.endDate, from), isNull(timeOffRequests.googleEventId))),
    db
      .select({ id: timeOffRequests.id })
      .from(timeOffRequests)
      .where(and(ne(timeOffRequests.status, "approved"), isNotNull(timeOffRequests.googleEventId))),
  ]);
  for (const r of [...toPublish, ...stale]) await publishTimeOff(r.id);
  return { published: toPublish.length, removed: stale.length };
}

/**
 * Reads the calendar between `from` and `to` (inclusive dates) into
 * team_calendar_events, matching each event to a hub user by its creator.
 */
export async function pullTeamCalendar(from: string, to: string): Promise<{ events: number; matched: number }> {
  if (!teamCalendarConfigured()) return { events: 0, matched: 0 };
  const tz = CALENDAR_TZ();
  const items: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  do {
    const res = await calendar().events.list({
      calendarId: teamCalendarId(),
      timeMin: `${from}T00:00:00Z`,
      timeMax: `${addDaysIso(to, 1)}T00:00:00Z`,
      singleEvents: true,
      showDeleted: false,
      maxResults: 250,
      pageToken,
    });
    items.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  const people = await db.select({ id: users.id, email: users.email }).from(users);
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p.id]));
  const events = items.map((e) => teamEventFromGoogle(e, tz)).filter((e): e is NonNullable<typeof e> => !!e);

  let matched = 0;
  for (const e of events) {
    const userId = (e.creatorEmail && byEmail.get(e.creatorEmail)) || null;
    if (userId) matched++;
    const values = { ...e, userId, updatedAt: new Date() };
    await db.insert(teamCalendarEvents).values(values).onConflictDoUpdate({ target: teamCalendarEvents.googleEventId, set: values });
  }
  // Events in the window that are gone from the calendar.
  const seen = events.map((e) => e.googleEventId);
  await db
    .delete(teamCalendarEvents)
    .where(
      and(
        gte(teamCalendarEvents.endDate, from),
        lte(teamCalendarEvents.startDate, to),
        seen.length ? notInArray(teamCalendarEvents.googleEventId, seen) : undefined,
      ),
    );
  return { events: events.length, matched };
}

/** Cached calendar events overlapping a range, for the hub calendar. */
export function teamEventsInRange(from: string, to: string, userIds?: string[]) {
  return db
    .select({
      id: teamCalendarEvents.googleEventId,
      summary: teamCalendarEvents.summary,
      allDay: teamCalendarEvents.allDay,
      startDate: teamCalendarEvents.startDate,
      endDate: teamCalendarEvents.endDate,
      startAt: teamCalendarEvents.startAt,
      endAt: teamCalendarEvents.endAt,
      timeZone: teamCalendarEvents.timeZone,
      userId: teamCalendarEvents.userId,
      userName: users.name,
    })
    .from(teamCalendarEvents)
    .leftJoin(users, eq(users.id, teamCalendarEvents.userId))
    .where(
      and(
        lte(teamCalendarEvents.startDate, to),
        gte(teamCalendarEvents.endDate, from),
        userIds?.length ? inArray(teamCalendarEvents.userId, userIds) : undefined,
      ),
    );
}
