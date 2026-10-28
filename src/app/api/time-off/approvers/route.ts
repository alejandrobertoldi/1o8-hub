import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isHubStaff } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** GET /api/time-off/approvers — who can approve time off (admins and above), for the profile dropdown. */
export async function GET() {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.role, ["owner", "super_admin", "admin"]))
    .orderBy(asc(users.name));
  return NextResponse.json(rows);
}
