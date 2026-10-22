import { NextRequest, NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users, userDepartmentLeads } from "@/lib/db/schema";
import { hasAdminPowers } from "@/lib/roles";
import { isTeamDepartment } from "@/lib/team/departments";
import { logEventAsync } from "@/lib/event-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/team/department-leads
 * Body: { department: TeamDepartment, userId: string | null }
 * Admin-tier. Assigns (or clears) the single lead for a department. The lead
 * may be ANY internal team member — they need not sit in that department (an
 * Account Manager can lead Design). The led department is stored as a row in
 * the user_department_leads junction, decoupled from users.department, with a
 * unique index on department enforcing one lead per department (but allowing
 * one person to lead several).
 */
export async function PUT(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json(
      { error: "Not permitted to assign department leads" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const department = (body as { department?: unknown }).department;
  const userId = (body as { userId?: unknown }).userId;
  if (!isTeamDepartment(department)) {
    return NextResponse.json({ error: "Unknown department" }, { status: 400 });
  }
  if (userId !== null && typeof userId !== "string") {
    return NextResponse.json(
      { error: "userId must be a string or null" },
      { status: 400 }
    );
  }

  let resourceLabel: string = department;
  if (typeof userId === "string") {
    const [candidate] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!candidate) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    resourceLabel = candidate.email;
  }

  await db.transaction(async (tx) => {
    // Clear this department's current lead (keyed on DEPARTMENT, so the chosen
    // person's OTHER lead rows are untouched — this is the multi-lead fix).
    await tx
      .delete(userDepartmentLeads)
      .where(eq(userDepartmentLeads.department, department));
    if (typeof userId === "string") {
      await tx.insert(userDepartmentLeads).values({ userId, department });
    }
  });

  after(
    logEventAsync({
      userEmail: session.user.email,
      userName: session.user.name ?? null,
      section: "admin",
      action: "user:department-lead:update",
      status: "success",
      resourceType: "department",
      resourceId: department,
      resourceLabel,
      detail: { department, userId },
    })
  );

  return NextResponse.json({ success: true });
}
