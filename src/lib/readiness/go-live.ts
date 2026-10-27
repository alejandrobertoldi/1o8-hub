import { and, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { asanaAssigneeMap, asanaTasks, serviceProviders, userDepartmentLeads, users } from "@/lib/db/schema";
import { assigneeKey, readinessDepartmentFor } from "./match";

/**
 * Go Live watch for department leads (My Dashboard): open Asana tasks whose
 * "Go Live Date" — the real deadline; the due date is the one that keeps
 * moving — is within the next few days or already passed. Departments are the
 * Readiness board's (AM, Creative, Email, Paid, Web, Ops), resolved per
 * assignee exactly like the board: its mapping row, else the team member's
 * or service provider's department.
 */

export const GO_LIVE_WINDOW_DAYS = 3;
/** Passed Go Lives still open stay listed this long; older ones are stale Asana, not news. */
export const GO_LIVE_PASSED_DAYS = 7;

export type GoLiveTask = {
  gid: string;
  name: string;
  url: string;
  clientIdCode: string | null;
  assignee: string;
  department: string;
  dueOn: string | null;
  goLiveDate: string;
  /** Days from today to Go Live (negative = passed). */
  daysLeft: number;
  /** The working due date sits after Go Live (or is missing): it can't make it as planned. */
  dueAfterGoLive: boolean;
};

const DAY = 86_400_000;
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** Tasks in the window, passed Go Lives first, then the soonest; pure. */
export function goLiveWindow(
  tasks: Omit<GoLiveTask, "daysLeft" | "dueAfterGoLive">[],
  today: string,
  days = GO_LIVE_WINDOW_DAYS,
): GoLiveTask[] {
  return tasks
    .map((t) => ({ ...t, daysLeft: daysBetween(today, t.goLiveDate), dueAfterGoLive: !t.dueOn || t.dueOn > t.goLiveDate }))
    .filter((t) => t.daysLeft <= days && t.daysLeft >= -GO_LIVE_PASSED_DAYS)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.department.localeCompare(b.department) || a.name.localeCompare(b.name));
}

/** The Readiness departments a person watches: the ones they lead, plus their own. */
export async function watchedDepartments(userId: string): Promise<{ departments: string[]; leads: string[] }> {
  const [[person], led, mapped] = await Promise.all([
    db.select({ departments: users.departments }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ department: userDepartmentLeads.department }).from(userDepartmentLeads).where(eq(userDepartmentLeads.userId, userId)),
    db.select({ department: asanaAssigneeMap.department }).from(asanaAssigneeMap).where(and(eq(asanaAssigneeMap.userId, userId), isNotNull(asanaAssigneeMap.department))),
  ]);
  const leads = [...new Set(led.map((l) => readinessDepartmentFor([l.department])).filter((d): d is NonNullable<typeof d> => !!d))];
  const own = mapped[0]?.department ?? readinessDepartmentFor(person?.departments ?? []);
  return { departments: [...new Set([...leads, ...(own ? [own] : [])])], leads };
}

/** Open tasks of these departments going live within `days` (or already passed). */
export async function goLiveSoon(departments: string[], today: string, days = GO_LIVE_WINDOW_DAYS): Promise<GoLiveTask[]> {
  if (!departments.length) return [];
  const [rows, map, people, providers] = await Promise.all([
    db
      .select({
        gid: asanaTasks.gid,
        name: asanaTasks.name,
        url: asanaTasks.permalinkUrl,
        clientIdCode: asanaTasks.clientIdCode,
        assigneeName: asanaTasks.assigneeName,
        assigneeEmail: asanaTasks.assigneeEmail,
        dueOn: asanaTasks.dueOn,
        goLiveDate: asanaTasks.goLiveDate,
      })
      .from(asanaTasks)
      .where(and(eq(asanaTasks.completed, false), isNotNull(asanaTasks.goLiveDate), gte(asanaTasks.goLiveDate, addDays(today, -GO_LIVE_PASSED_DAYS)), lte(asanaTasks.goLiveDate, addDays(today, days)))),
    db.select().from(asanaAssigneeMap),
    db.select({ id: users.id, name: users.name, departments: users.departments }).from(users),
    db.select({ id: serviceProviders.id, name: serviceProviders.name, department: serviceProviders.department }).from(serviceProviders),
  ]);
  const mapByKey = new Map(map.map((m) => [m.assigneeKey, m]));
  const userById = new Map(people.map((p) => [p.id, p]));
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const wanted = new Set(departments);

  const tasks = rows.flatMap((r) => {
    if (!r.goLiveDate || (!r.assigneeName && !r.assigneeEmail)) return [];
    const m = mapByKey.get(assigneeKey({ name: r.assigneeName, email: r.assigneeEmail }));
    if (m?.excluded) return [];
    const user = m?.userId ? userById.get(m.userId) : undefined;
    const provider = !user && m?.providerId ? providerById.get(m.providerId) : undefined;
    const department = m?.department ?? (user ? readinessDepartmentFor(user.departments) : provider?.department ?? null);
    if (!department || !wanted.has(department)) return [];
    return [{
      gid: r.gid,
      name: r.name,
      url: r.url,
      clientIdCode: r.clientIdCode,
      assignee: user?.name ?? provider?.name ?? r.assigneeName ?? r.assigneeEmail ?? "",
      department,
      dueOn: r.dueOn,
      goLiveDate: r.goLiveDate,
    }];
  });
  return goLiveWindow(tasks, today, days);
}
