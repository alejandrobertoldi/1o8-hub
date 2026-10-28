import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeOffBalances, timeOffRequests, users } from "@/lib/db/schema";
import { addDaysIso, timeRangeLabel } from "./calendar-events";
import { teamEventsInRange } from "./team-calendar";

/**
 * Team time off (admins): who's out in the coming days — approved time off
 * from the hub and Gusto plus what's on the shared Google Calendar — and each
 * person's balances (Gusto) and days taken this year.
 */

const STAFF_ROLES = ["owner", "super_admin", "admin", "editor", "viewer"] as const;

export type OutEntry = {
  key: string;
  userId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  source: "hub" | "gusto" | "calendar";
  label: string;
  time: string | null;
};

export type TeamMemberTimeOff = {
  id: string;
  name: string;
  email: string;
  timeOffVia: string;
  gustoLinked: boolean;
  balances: { policyName: string; policyType: string | null; hours: number | null; updatedAt: string }[];
  daysTaken: number;
  upcomingDays: number;
};

export async function teamTimeOff(today: string, days = 14) {
  const to = addDaysIso(today, days);
  const year = today.slice(0, 4);
  const [people, balances, requests, events] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, email: users.email, timeOffVia: users.timeOffVia, gustoEmployeeUuid: users.gustoEmployeeUuid })
      .from(users)
      .where(inArray(users.role, [...STAFF_ROLES]))
      .orderBy(asc(users.name)),
    db.select().from(timeOffBalances),
    db
      .select({
        id: timeOffRequests.id,
        userId: timeOffRequests.userId,
        startDate: timeOffRequests.startDate,
        endDate: timeOffRequests.endDate,
        source: timeOffRequests.source,
        kind: timeOffRequests.kind,
        workingDays: timeOffRequests.workingDays,
      })
      .from(timeOffRequests)
      .where(and(eq(timeOffRequests.status, "approved"), gte(timeOffRequests.endDate, `${year}-01-01`), lte(timeOffRequests.startDate, `${Number(year) + 1}-12-31`))),
    teamEventsInRange(today, to).catch(() => []),
  ]);
  const nameOf = new Map(people.map((p) => [p.id, p.name ?? p.email]));

  const out: OutEntry[] = [
    ...requests
      .filter((r) => r.startDate <= to && r.endDate >= today)
      .map((r) => ({
        key: r.id,
        userId: r.userId,
        name: nameOf.get(r.userId) ?? "Team member",
        startDate: r.startDate,
        endDate: r.endDate,
        source: (r.source === "gusto" ? "gusto" : "hub") as OutEntry["source"],
        label: r.kind === "sick" ? "Sick" : "PTO",
        time: null,
      })),
    ...events.map((e) => ({
      key: `gcal:${e.id}`,
      userId: e.userId,
      name: e.userName ?? e.summary,
      startDate: e.startDate,
      endDate: e.endDate,
      source: "calendar" as const,
      label: e.summary,
      time: !e.allDay && e.startAt && e.endAt ? timeRangeLabel(e.startAt, e.endAt, e.timeZone) : null,
    })),
  ].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));

  const members: TeamMemberTimeOff[] = people.map((p) => {
    const mine = requests.filter((r) => r.userId === p.id);
    return {
      id: p.id,
      name: p.name ?? p.email,
      email: p.email,
      timeOffVia: p.timeOffVia,
      gustoLinked: !!p.gustoEmployeeUuid,
      balances: balances
        .filter((b) => b.userId === p.id)
        .map((b) => ({ policyName: b.policyName, policyType: b.policyType, hours: b.balanceHours == null ? null : Number(b.balanceHours), updatedAt: b.updatedAt.toISOString() })),
      daysTaken: mine.filter((r) => r.startDate.startsWith(year) && r.startDate <= today).reduce((s, r) => s + r.workingDays, 0),
      upcomingDays: mine.filter((r) => r.startDate > today).reduce((s, r) => s + r.workingDays, 0),
    };
  });

  return { today, to, out, members };
}
