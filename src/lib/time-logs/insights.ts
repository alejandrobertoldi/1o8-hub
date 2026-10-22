import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamDirectoryProfiles, timeLogs, users } from "@/lib/db/schema";
import { BILLING_TYPES, TIMESHEET_LIMIT, TIME_SETTINGS, WEEKLY_CAPACITY_HOURS, workdaysBetween } from "./catalog";
import { listLoggableClients } from "./server";
import { readinessDepartmentFor } from "@/lib/readiness/match";

export type InsightFilters = {
  /** Readiness team label (AM, Creative, Email, Paid, Web, Ops), from the person's departments. */
  team?: string | null;
  userId?: string | null;
  /** Department / Type of Work on the entry (time_logs.department). */
  workType?: string | null;
  /** Client code on the entry. */
  client?: string | null;
};


/** Monday (YYYY-MM-DD) of the week a date falls in. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const addTo = (m: Record<string, number>, k: string, v: number) => {
  m[k] = round2((m[k] ?? 0) + v);
};

/** Average calendar days per month, to prorate a monthly estimate to any range. */
const DAYS_PER_MONTH = 30.44;

/**
 * The "Insights" tab of TIME TRACKING 2.0, computed from time_logs for a date
 * range. Expected hours only count workdays up to today (future days in the
 * range can't be "missing" yet).
 */
export async function buildInsights(from: string, to: string, today = new Date().toISOString().slice(0, 10), filters: InsightFilters = {}) {
  const [allLogs, fullTeam, clients] = await Promise.all([
    db
      .select({
        userId: timeLogs.userId,
        date: timeLogs.entryDate,
        hours: timeLogs.hours,
        client: timeLogs.clientIdCode,
        department: timeLogs.department,
        projectNumber: timeLogs.projectNumber,
        projectName: timeLogs.projectName,
        billingType: timeLogs.billingType,
        note: timeLogs.note,
      })
      .from(timeLogs)
      .where(and(gte(timeLogs.entryDate, from), lte(timeLogs.entryDate, to))),
    db
      .select({ id: users.id, name: users.name, departments: users.departments })
      .from(users)
      .innerJoin(teamDirectoryProfiles, eq(teamDirectoryProfiles.userId, users.id))
      .where(eq(users.employmentStatus, "active"))
      .orderBy(asc(users.name)),
    listLoggableClients(),
  ]);

  // Filters: team (Readiness department of the person), one person, one type of work.
  const teamOf = (departments: string[] | null) => readinessDepartmentFor(departments ?? []);
  const team = fullTeam.filter(
    (t) => (!filters.team || teamOf(t.departments) === filters.team) && (!filters.userId || t.id === filters.userId),
  );
  const inScope = new Set(team.map((t) => t.id));
  const logs = allLogs.filter(
    (l) =>
      (!filters.team && !filters.userId ? true : inScope.has(l.userId)) &&
      (!filters.workType || l.department === filters.workType) &&
      (!filters.client || l.client.toUpperCase() === filters.client.toUpperCase()),
  );
  const name = new Map(fullTeam.map((t) => [t.id, t.name ?? "—"]));
  const expectedTo = to < today ? to : today;
  const workdays = workdaysBetween(from, to);
  const workdaysSoFar = expectedTo >= from ? workdaysBetween(from, expectedTo) : 0;

  // ── 1. Compliance ──
  const perUserDay = new Map<string, Map<string, number>>();
  for (const l of logs) {
    const days = perUserDay.get(l.userId) ?? new Map<string, number>();
    days.set(l.date, (days.get(l.date) ?? 0) + Number(l.hours));
    perUserDay.set(l.userId, days);
  }
  const isWeekday = (d: string) => {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    return wd !== 0 && wd !== 6;
  };
  const compliance = team.map((t) => {
    const days = perUserDay.get(t.id) ?? new Map<string, number>();
    const logged = [...days.values()].reduce((a, b) => a + b, 0);
    const expected = workdaysSoFar * TIME_SETTINGS.dailyMinimumHours;
    const weekdayEntries = [...days.entries()].filter(([d]) => isWeekday(d) && d <= expectedTo);
    return {
      userId: t.id,
      name: t.name ?? "—",
      hoursLogged: round2(logged),
      expectedHours: expected,
      gap: round2(Math.max(0, expected - logged)),
      workdaysLogged: weekdayEntries.length,
      // Days with nothing logged count too, like the sheet's "workdays under the minimum".
      workdaysUnderMinimum:
        weekdayEntries.filter(([, h]) => h < TIME_SETTINGS.dailyMinimumHours).length + (workdaysSoFar - weekdayEntries.length),
    };
  });

  // ── 2–6. Breakdowns ──
  const byPersonDepartment: Record<string, Record<string, number>> = {};
  const byPersonBilling: Record<string, Record<string, number>> = {};
  const billingTotals: Record<string, number> = {};
  const byClientDepartment: Record<string, Record<string, number>> = {};
  const clientHours: Record<string, number> = {};
  const projects = new Map<string, { projectNumber: string; projectName: string; client: string; hours: number }>();
  // The "Summary" tab of TIME TRACKING 2026: person × client.
  const byPersonClient: Record<string, Record<string, number>> = {};
  // Hours per week (Monday) by billing type, for the trend.
  const weekly: Record<string, Record<string, number>> = {};
  const byWorkType: Record<string, number> = {};
  const peopleLogging = new Set<string>();
  const clientStats = new Map<string, { hours: number; entries: number; people: Set<string> }>();
  const personStats = new Map<string, { hours: number; entries: number; days: Set<string>; clients: Set<string>; client: number }>();
  for (const l of logs) {
    const h = Number(l.hours);
    const who = name.get(l.userId) ?? "Former team member";
    addTo((byPersonDepartment[who] ??= {}), l.department, h);
    addTo((byPersonBilling[who] ??= {}), l.billingType, h);
    addTo(billingTotals, l.billingType, h);
    addTo((byClientDepartment[l.client] ??= {}), l.department, h);
    addTo(clientHours, l.client, h);
    addTo((byPersonClient[who] ??= {}), l.client, h);
    addTo((weekly[weekStart(l.date)] ??= {}), l.billingType, h);
    addTo(byWorkType, l.department, h);
    peopleLogging.add(l.userId);
    const cs = clientStats.get(l.client) ?? { hours: 0, entries: 0, people: new Set<string>() };
    cs.hours = round2(cs.hours + h);
    cs.entries += 1;
    cs.people.add(l.userId);
    clientStats.set(l.client, cs);
    const ps = personStats.get(l.userId) ?? { hours: 0, entries: 0, days: new Set<string>(), clients: new Set<string>(), client: 0 };
    ps.hours = round2(ps.hours + h);
    ps.entries += 1;
    ps.days.add(l.date);
    if (l.billingType === BILLING_TYPES.client) {
      ps.clients.add(l.client);
      ps.client = round2(ps.client + h);
    }
    personStats.set(l.userId, ps);
    const p = projects.get(l.projectNumber) ?? { projectNumber: l.projectNumber, projectName: l.projectName, client: l.client, hours: 0 };
    p.hours = round2(p.hours + h);
    projects.set(l.projectNumber, p);
  }

  const calendarDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  const months = calendarDays / DAYS_PER_MONTH;
  const clientVsEstimate = clients
    .filter((c) => c.code !== "1O8")
    .map((c) => {
      const hours = clientHours[c.code] ?? 0;
      const estimate = c.estimatedHours != null ? round2(c.estimatedHours * months) : null;
      return {
        client: c.code,
        clientName: c.name,
        hours,
        monthlyEstimate: c.estimatedHours,
        estimate,
        // Hours above the estimate = work delivered that the client isn't paying for.
        overEstimate: estimate != null ? round2(Math.max(0, hours - estimate)) : null,
        usedPct: estimate ? Math.round((hours / estimate) * 100) : null,
      };
    })
    .filter((c) => c.hours > 0 || c.estimate != null)
    .sort((a, b) => b.hours - a.hours || a.client.localeCompare(b.client));

  const totalHours = round2(logs.reduce((a, l) => a + Number(l.hours), 0));
  const expectedHours = round2(compliance.reduce((a, c) => a + c.expectedHours, 0));
  // Every week in the range, even empty ones, so the trend has no gaps.
  const weeks: string[] = [];
  const activeDays = new Set(logs.map((l) => `${l.userId}|${l.date}`)).size;
  const clientCodes = [...clientStats.keys()].filter((c) => c.toUpperCase() !== "1O8");
  const topClient = clientCodes.sort((a, b) => clientStats.get(b)!.hours - clientStats.get(a)!.hours)[0] ?? null;
  const people = filters.userId ? 1 : team.length;
  const clipFrom = (w: string) => (w < from ? from : w);
  const weekEnd = (w: string) => {
    const d = new Date(`${w}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 6);
    const e = d.toISOString().slice(0, 10);
    return e > to ? to : e;
  };
  for (let w = weekStart(from); w <= to; ) {
    weeks.push(w);
    const d = new Date(`${w}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    w = d.toISOString().slice(0, 10);
  }

  return {
    range: { from, to, workdays, workdaysSoFar },
    totals: {
      hours: totalHours,
      entries: logs.length,
      expectedHours,
      // Share of the expected hours (8 h × workdays so far × people in scope) that got logged.
      // Not meaningful for one type of work (8 h/day covers all of them).
      loggedPct: expectedHours && !filters.workType ? Math.round((totalHours / expectedHours) * 100) : null,
      peopleLogging: [...peopleLogging].filter((id) => inScope.has(id)).length,
      peopleInScope: team.length,
      activeClients: clientCodes.length,
      topClient: topClient ? { code: topClient, hours: clientStats.get(topClient)!.hours } : null,
      // Average per person who logged, and per person-day with entries ("run-rate").
      avgHoursPerMember: peopleLogging.size ? round2(totalHours / peopleLogging.size) : 0,
      avgHoursPerActiveDay: activeDays ? round2(totalHours / activeDays) : 0,
    },
    clientStats: [...clientStats]
      .map(([code, c]) => ({ client: code, hours: c.hours, entries: c.entries, people: c.people.size, share: totalHours ? round2((c.hours / totalHours) * 100) : 0 }))
      .sort((a, b) => b.hours - a.hours),
    personStats: [...personStats]
      .map(([id, p]) => ({
        userId: id,
        name: name.get(id) ?? "Former team member",
        hours: p.hours,
        entries: p.entries,
        activeDays: p.days.size,
        avgPerDay: p.days.size ? round2(p.hours / p.days.size) : 0,
        clients: p.clients.size,
        clientSharePct: p.hours ? Math.round((p.client / p.hours) * 100) : 0,
      }))
      .sort((a, b) => b.hours - a.hours),
    entries: [...logs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, TIMESHEET_LIMIT)
      .map((l) => ({
        date: l.date,
        person: name.get(l.userId) ?? "Former team member",
        client: l.client,
        workType: l.department,
        projectNumber: l.projectNumber,
        projectName: l.projectName,
        billingType: l.billingType,
        hours: Number(l.hours),
        note: l.note,
      })),
    capacityPerWeek: WEEKLY_CAPACITY_HOURS * people,
    clientNames: Object.fromEntries(clients.map((c) => [c.code, c.name])),
    people: fullTeam.map((t) => ({ id: t.id, name: t.name ?? "—", team: teamOf(t.departments) })),
    byPersonClient,
    // Capacity = 8 h × workdays of the week inside the range × people (40 h per person for a full week).
    weekly: weeks.map((w) => ({
      week: w,
      capacity: workdaysBetween(clipFrom(w), weekEnd(w)) * TIME_SETTINGS.dailyMinimumHours * people,
      total: round2(Object.values(weekly[w] ?? {}).reduce((a, b) => a + b, 0)),
      ...(weekly[w] ?? {}),
    })),
    byWorkType,
    billingTypes: Object.values(BILLING_TYPES),
    compliance,
    byPersonDepartment,
    byPersonBilling,
    billingTotals,
    clientVsEstimate,
    byClientDepartment,
    topProjects: [...projects.values()].sort((a, b) => b.hours - a.hours).slice(0, 15),
  };
}

export type TimeInsights = Awaited<ReturnType<typeof buildInsights>>;
