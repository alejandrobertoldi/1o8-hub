import { NextResponse } from "next/server";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users, userDepartmentLeads } from "@/lib/db/schema";
import { displayJobTitles } from "@/lib/team/departments";

export const maxDuration = 60;

/**
 * GET /api/team
 * Returns 1o8 team members (id, name, email, image) for any
 * authenticated user. Consumed by the team-assignment pickers (client
 * onboarding, client detail/gantt, A+ comment thread).
 *
 * Scoped to active @marketfoundry.agency accounts, PLUS any active account
 * with a department assigned: the 1o8→1o8 rebrand left duplicate
 * `users` rows per person (an old @1o8.agency row and a new
 * @marketfoundry.agency row), so an @marketfoundry-only filter keeps the
 * legacy 1o8 duplicates out — but 1o8 and 1o8 also share some real
 * team members (e.g. Bruna Freire, @1o8.agency, on finance). A department
 * assignment is the opt-in signal that admits those genuinely-shared people
 * without dragging the undepartmented duplicates back in.
 *
 * Extended by migration 0090 with the tier-0 directory fields (job title,
 * employment status, phone, Slack handle), by 0115 with department + the
 * full job-titles list, and by 0118 with multi-department membership
 * (`departments`) + aggregated `leadsDepartments` from the
 * user_department_leads junction. Nothing above tier 0 may be added here —
 * see spec D3.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      asanaEmail: users.asanaEmail,
      image: users.image,
      role: users.role,
      clientIdCode: users.clientIdCode,
      jobTitle: users.jobTitle,
      jobTitles: users.jobTitles,
      // Multi-department membership (0118). Replaces the vestigial scalar
      // `department` — see schema.ts.
      departments: users.departments,
      employmentStatus: users.employmentStatus,
      phone: users.phone,
      slackHandle: users.slackHandle,
    })
    .from(users)
    // BOTH filters in ONE where(). Drizzle's .where() REPLACES the previous
    // predicate rather than ANDing with it, so chaining a second call would
    // silently drop a filter and let unwanted rows back into every team
    // picker.
    //
    // employment_status is the long-term filter, but the @marketfoundry
    // base STAYS until every row has a status set by hand: 0090 defaults
    // every existing row to 'active', including the 1o8-era rebrand
    // duplicates, so dropping it today would undo the rebrand cleanup.
    // Removing it is a follow-up.
    //
    // 1o8 and 1o8 share some team members (e.g. Bruna Freire,
    // bruna.freire@1o8.agency, on the finance department), so an
    // @marketfoundry-only filter also hides genuinely-shared people. A
    // department assignment is the opt-in signal for "genuinely shared, not
    // a stale duplicate": of the active @1o8.agency accounts, only the real
    // shared members have ever been given a department, so ORing in
    // "has any department" admits them without dragging the undepartmented
    // rebrand duplicates back in.
    .where(
      and(
        eq(users.employmentStatus, "active"),
        or(
          ilike(users.email, "%@1o8.agency"),
          sql`coalesce(array_length(${users.departments}, 1), 0) > 0`
        )
      )
    );

  // Who leads which department (0118 junction) — decoupled from `departments`
  // membership above, so a lead can come from outside the department. One
  // person can lead several; aggregate rows -> array per user.
  const leadRows = await db
    .select({
      userId: userDepartmentLeads.userId,
      department: userDepartmentLeads.department,
    })
    .from(userDepartmentLeads);
  const leadsByUser = new Map<string, string[]>();
  for (const r of leadRows) {
    const arr = leadsByUser.get(r.userId) ?? [];
    arr.push(r.department);
    leadsByUser.set(r.userId, arr);
  }

  return NextResponse.json(
    allUsers.map((u) => ({
      ...u,
      jobTitles: displayJobTitles(u.jobTitle, u.jobTitles),
      leadsDepartments: leadsByUser.get(u.id) ?? [],
    }))
  );
}
