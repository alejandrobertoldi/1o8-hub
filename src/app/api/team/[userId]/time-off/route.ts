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
 * Approved PTO detail for the team member page. Dates + workingDays are
 * visible to any authenticated staff who can load the profile; reason and
 * decisionNote stay private to self + admin (D8 spirit on the shared
 * calendar — here we still show them when the viewer is the subject or an
 * admin, matching /calendar/requests).
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
  const includePrivate = access.isSelf || access.isAdmin;

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
      ...(includePrivate
        ? { reason: r.reason, decisionNote: r.decisionNote }
        : {}),
    })),
  });
}
