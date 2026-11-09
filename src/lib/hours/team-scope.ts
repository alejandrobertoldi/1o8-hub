import { and, arrayOverlaps, inArray, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { userDepartmentLeads, users } from "@/lib/db/schema";
import { hasPeopleAccess } from "@/lib/roles";

/**
 * Whose hours a team-hours report may show the signed-in person:
 *   null       → everyone (owners and super admins)
 *   string[]   → admins: the people of their own departments (the ones they
 *                sit in or lead, per the Team directory) plus themselves;
 *                owners and super admins are never in an admin's team.
 */
export async function hoursTeamScope(user: { id?: string | null; role?: string | null }): Promise<string[] | null> {
  if (hasPeopleAccess(user.role)) return null;
  if (!user.id) return [];
  const [me] = await db.select({ departments: users.departments }).from(users).where(inArray(users.id, [user.id]));
  const led = await db.select({ department: userDepartmentLeads.department }).from(userDepartmentLeads).where(inArray(userDepartmentLeads.userId, [user.id]));
  const departments = [...new Set([...(me?.departments ?? []), ...led.map((l) => l.department)])];
  if (!departments.length) return [user.id];
  const team = await db
    .select({ id: users.id })
    .from(users)
    .where(and(arrayOverlaps(users.departments, departments), notInArray(users.role, ["owner", "super_admin"])));
  return [...new Set([user.id, ...team.map((t) => t.id)])];
}

/** The requested people narrowed to the scope (null scope = as requested). */
export function withinScope(scope: string[] | null, requested: string[]): string[] | undefined {
  if (!scope) return requested.length ? requested : undefined;
  if (!requested.length) return scope;
  const allowed = new Set(scope);
  const kept = requested.filter((id) => allowed.has(id));
  // Asking only for people outside the team returns nothing, never everyone.
  return kept.length ? kept : ["00000000-0000-0000-0000-000000000000"];
}
