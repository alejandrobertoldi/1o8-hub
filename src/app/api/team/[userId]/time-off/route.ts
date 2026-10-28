import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { resolveAccess } from "@/lib/team/access";
import { readIsSuperAdmin } from "@/lib/team/access-db";
import {
  getApprovedRequestsForUser,
  getDaysTakenByUser,
} from "@/lib/time-off/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/team/[userId]/time-off?year=2026
 *
 * Approved PTO detail and days taken for the team member page: the person
 * themselves, admins and above only (reason and decisionNote included, as on
 * /calendar/requests). Everyone else sees who's off on the shared calendar.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const yearRaw = req.nextUrl.searchParams.get("year");
  const year = Number(yearRaw);
  if (!yearRaw || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year is out of range" }, { status: 400 });
  }

  const isSuperAdmin = await readIsSuperAdmin(session.user.id);
  const access = resolveAccess(
    { id: session.user.id, role: session.user.role },
    userId,
    isSuperAdmin
  );
  // Days taken and dates: the person, admins and above only.
  if (!access.isSelf && !access.isAdmin && !access.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [requests, daysTaken] = await Promise.all([
    getApprovedRequestsForUser(userId, year),
    getDaysTakenByUser(userId, year),
  ]);

  return NextResponse.json({
    year,
    daysTaken,
    requests: requests.map((r) => ({
      id: r.id,
      startDate: r.startDate,
      endDate: r.endDate,
      workingDays: r.workingDays,
      decidedAt: r.decidedAt,
      reason: r.reason,
      decisionNote: r.decisionNote,
    })),
  });
}
