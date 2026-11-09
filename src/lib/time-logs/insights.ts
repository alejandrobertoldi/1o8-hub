import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamDirectoryProfiles, timeLogs, users } from "@/lib/db/schema";
import { BILLING_TYPES, TIMESHEET_LIMIT, TIME_SETTINGS, WEEKLY_CAPACITY_HOURS, workdaysBetween } from "./catalog";
import { listLoggableClients } from "./server";
import { DEFAULT_HOLIDAY_CALENDAR, holidayCalendar, holidaysByCalendar } from "./holidays";
import { readinessDepartmentFor } from "@/lib/readiness/match";
import { listDepartmentEstimates } from "./estimates";

export type InsightFilters = {
  /** Readiness team label (AM, Creative, Email, Paid, Web, Ops), from the person's departments. */
  team?: string | null;
  userId?: string | null;
  /** Only these people (an admin's team); undefined = everyone. */
  userIds?: string[];
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
  // Expected hours start when hour logging went live, not before.
  const expectedFrom = from < TIME_SETTINGS.trackingStartDate ? TIME_SETTINGS.trackingStartDate : from;
  const [allLogs, fullTeam, clients, holidays, deptEstimates] = await Promise.all([
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
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, departments: users.departments, countryCode: users.countryCode })
      .from(users)
      .innerJoin(teamDirectoryProfiles, eq(teamDirectoryProfiles.userId, users.id))
      .where(eq(users.employmentStatus, "active"))
      .orderBy(asc(users.name)),
    listLoggableClients(),
    holidaysByCalendar(from < expectedFrom ? from : expectedFrom, to),
    listDepartmentEstimates(),
  ]);
  // Holidays on each person's calendar aren't workdays (US when none is assigned).
  const holidaysOf = (countryCode: string | null) => holidays.get(holidayCalendar(countryCode)) ?? new Set<string>();
  const usHolidays = holidays.get(DEFAULT_HOLIDAY_CALENDAR) ?? new Set<string>();

  // Filters: team (Readiness department of the person), one person, one type of work.
  const teamOf = (departments: string[] | null) => readinessDepartmentFor(departments ?? []);
  const visible = filters.userIds ? fullTeam.filter((t) => filters.userIds!.includes(t.id)) : fullTeam;
  const team = visible.filter(
    (t) => (!filters.team || teamOf(t.departments) === filters.team) && (!filters.userId || t.id === filters.userId),
  );
  const inScope = new Set(team.map((t) => t.id));
  const logs = allLogs.filter(
    (l) =>
      (!filters.team && !filters.userId && !filters.userIds ? true : inScope.has(l.userId)) &&
      (!filters.workType || l.department === filters.workType) &&
      (!filters.client || l.client.toUpperCase() === filters.client.toUpperCase()),
  );
  const name = new Map(fullTeam.map((t) => [t.id, t.name ?? "—"]));
  const expectedTo = to < today ? to : today;
  // The range's workdays as shown (US calendar); each person's expected hours use their own calendar.
  const workdays = workdaysBetween(from, to, usHolidays);
  const workdaysSoFar = expectedTo >= expectedFrom ? workdaysBetween(expectedFrom, expectedTo, usHolidays) : 0;

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
    const off = holidaysOf(t.countryCode);
    const theirWorkdays = expectedTo >= expectedFrom ? workdaysBetween(expectedFrom, expectedTo, off) : 0;
    const expected = theirWorkdays * TIME_SETTINGS.dailyMinimumHours;
    const weekdayEntries = [...days.entries()].filter(([d]) => isWeekday(d) && !off.has(d) && d >= expectedFrom && d <= expectedTo);
    return {
      userId: t.id,
      name: t.name ?? "—",
      email: t.email,
      role: t.role,
      hoursLogged: round2(logged),
      expectedHours: expected,
      gap: round2(Math.max(0, expected - logged)),
      workdaysLogged: weekdayEntries.length,
      // Days with nothing logged count too, like the sheet's "workdays under the minimum".
      workdaysUnderMinimum:
        weekdayEntries.filter(([, h]) => h < TIME_SETTINGS.dailyMinimumHours).length + (theirWorkdays - weekdayEntries.length),
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
    // Past clients only show up when someone logged hours to them in the range.
    .filter((c) => c.code !== "1O8" && (c.active || (clientHours[c.code] ?? 0) > 0))
    .map((c) => {
      const hours = clientHours[c.code] ?? 0;
      const estimate = c.estimatedHours != null ? round2(c.estimatedHours * months) : null;
      // Department split: actual hours by type of work next to each department's own estimate.
      const split = deptEstimates[c.code.toUpperCase()] ?? {};
      const actual = byClientDepartment[c.code] ?? {};
      const departments = [...new Set([...Object.keys(split), ...Object.keys(actual)])]
        .map((department) => {
          const monthly = (department in split ? split[department] : null) as number | null;
          const est = monthly != null ? round2(monthly * months) : null;
          const h = round2(actual[department] ?? 0);
          return { department, hours: h, monthlyEstimate: monthly, estimate: est, usedPct: est ? Math.round((h / est) * 100) : null };
        })
        .sort((a, b) => b.hours - a.hours || (b.estimate ?? 0) - (a.estimate ?? 0) || a.department.localeCompare(b.department));
      const splitTotal = Object.values(split).reduce((a, b) => a + b, 0);
      return {
        departments,
        /** Sum of the department estimates (monthly); null when the client has no split yet. */
        monthlySplitTotal: splitTotal > 0 ? round2(splitTotal) : null,
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
  const clipFrom = (w: string) => (w < expectedFrom ? expectedFrom : w);
  const weekEnd = (w: string) => {
    const d = new Date(`${w}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 6);
    const e = d.toISOString().slice(0, 10);
    return e > to ? to : e;
  };
  for (let w = weekStart(from); w <= to; ) {
    // A week whose days in the range are all weekend (a range starting on a Sunday) has
    // nothing to measure: leave it out unless hours were logged in it.
    if (workdaysBetween(w < from ? from : w, weekEnd(w)) > 0 || weekly[w]) weeks.push(w);
    const d = new Date(`${w}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    w = d.toISOString().slice(0, 10);
  }
  // 8 h × each person's workdays that week (inside the range, after hour logging went live), minus their holidays.
  const capacityOf = (w: string) =>
    team.reduce((sum, t) => sum + workdaysBetween(clipFrom(w), weekEnd(w), holidaysOf(t.countryCode)), 0) * TIME_SETTINGS.dailyMinimumHours;

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
    people: visible.map((t) => ({ id: t.id, name: t.name ?? "—", team: teamOf(t.departments) })),
    byPersonClient,
    // Capacity = 8 h × each person's workdays of the week inside the range, holidays excluded (40 h for a full week).
    weekly: weeks.map((w) => ({
      week: w,
      capacity: capacityOf(w),
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
