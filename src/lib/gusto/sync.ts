import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeOffBalances, timeOffRequests, users } from "@/lib/db/schema";
import { countWorkingDays } from "@/lib/time-off/working-days";
import { getHolidayDates } from "@/lib/time-off/queries";
import { publishTimeOff } from "@/lib/time-off/team-calendar";
import { gustoConnection, gustoGet, gustoGetAll } from "./client";
import { normalizeBalances, normalizeEmployee, normalizeTimeOff, type GustoTimeOff } from "./normalize";

export type GustoImportReport = {
  employees: number;
  matchedEmployees: number;
  unmatchedEmployees: string[];
  requests: number;
  created: number;
  updated: number;
  skipped: string[];
  balances: number;
};

const isExclusionViolation = (err: unknown) => (err as { code?: unknown })?.code === "23P01";

/**
 * Reads 1o8's Gusto company into the hub: links team members to their Gusto
 * employee (by email), mirrors their time off requests as read-only
 * `source = "gusto"` rows (so they show on the calendar, in who's out and in
 * days taken) and stores PTO / sick balances. Approved ones get published to
 * the shared calendar like hub-approved time off.
 */
export async function importFromGusto(): Promise<GustoImportReport> {
  const conn = await gustoConnection();
  if (!conn?.companyUuid) throw new Error("Gusto isn't connected (or the company is unknown)");
  const company = conn.companyUuid;
  const report: GustoImportReport = { employees: 0, matchedEmployees: 0, unmatchedEmployees: [], requests: 0, created: 0, updated: 0, skipped: [], balances: 0 };

  // 1. Employees → users by email.
  const employees = (await gustoGetAll(`/v1/companies/${company}/employees`)).map(normalizeEmployee).filter((e): e is NonNullable<typeof e> => !!e);
  report.employees = employees.length;
  const people = await db.select({ id: users.id, email: users.email, countryCode: users.countryCode }).from(users);
  const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p]));
  const userByEmployee = new Map<string, (typeof people)[number]>();
  for (const e of employees) {
    const user = e.emails.map((m) => byEmail.get(m)).find(Boolean);
    if (!user) {
      report.unmatchedEmployees.push(e.name);
      continue;
    }
    userByEmployee.set(e.uuid, user);
    await db.update(users).set({ gustoEmployeeUuid: e.uuid }).where(eq(users.id, user.id));
  }
  report.matchedEmployees = userByEmployee.size;

  // 2. Time off requests.
  const requests = (await gustoGetAll(`/v1/companies/${company}/time_off/requests`)).map(normalizeTimeOff).filter((r): r is GustoTimeOff => !!r);
  report.requests = requests.length;
  const existing = requests.length
    ? await db
        .select({ id: timeOffRequests.id, externalId: timeOffRequests.externalId, status: timeOffRequests.status, startDate: timeOffRequests.startDate, endDate: timeOffRequests.endDate })
        .from(timeOffRequests)
        .where(and(eq(timeOffRequests.source, "gusto"), inArray(timeOffRequests.externalId, requests.map((r) => r.externalId))))
    : [];
  const byExternal = new Map(existing.map((e) => [e.externalId, e]));

  for (const r of requests) {
    const user = userByEmployee.get(r.employeeUuid);
    if (!user) continue;
    const workingDays = r.days ? r.days.length : countWorkingDays(r.startDate, r.endDate, await getHolidayDates(user.countryCode, r.startDate, r.endDate));
    const values = {
      userId: user.id,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.note || `${r.kind === "sick" ? "Sick" : "Time off"} (Gusto)`,
      status: r.status,
      workingDays,
      kind: r.kind,
      updatedAt: new Date(),
    };
    const prev = byExternal.get(r.externalId);
    try {
      if (prev) {
        if (prev.status === r.status && prev.startDate === r.startDate && prev.endDate === r.endDate) continue;
        await db.update(timeOffRequests).set(values).where(eq(timeOffRequests.id, prev.id));
        report.updated++;
        await publishTimeOff(prev.id);
      } else {
        const [row] = await db.insert(timeOffRequests).values({ ...values, source: "gusto", externalId: r.externalId }).returning({ id: timeOffRequests.id });
        report.created++;
        await publishTimeOff(row.id);
      }
    } catch (err) {
      if (!isExclusionViolation(err)) throw err;
      report.skipped.push(`${r.startDate}–${r.endDate} overlaps a hub request for the same person`);
    }
  }

  // 3. Balances (an account without the balances endpoint still imports the rest).
  const balances = normalizeBalances(await gustoGet(`/v1/companies/${company}/time_off_balances`).catch(() => []));
  for (const b of balances) {
    const user = userByEmployee.get(b.employeeUuid);
    if (!user) continue;
    const values = { policyType: b.policyType, balanceHours: b.hours == null ? null : String(b.hours), source: "gusto", updatedAt: new Date() };
    await db
      .insert(timeOffBalances)
      .values({ userId: user.id, policyName: b.policyName, ...values })
      .onConflictDoUpdate({ target: [timeOffBalances.userId, timeOffBalances.policyName], set: values });
    report.balances++;
  }
  return report;
}
