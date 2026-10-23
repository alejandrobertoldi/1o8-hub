export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isHubStaff } from "@/lib/roles";
import { chicagoToday, readinessDepartmentFor } from "@/lib/readiness/match";
import { computeReadiness, listSnapshotDates, loadSnapshot, personReadiness } from "@/lib/readiness/server";
import { guarded } from "@/lib/db/guarded-route";

/**
 * GET /api/readiness/person?user=<id> — one person's live readiness and their
 * department's, plus the latest saved snapshot before today to compare with
 * (for My Dashboard). Defaults to the signed-in user. Staff only, like the board.
 */
async function getHandler(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("user") || session.user.id;
  const [user] = await db.select({ departments: users.departments }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const today = chicagoToday();
  const fallback = readinessDepartmentFor(user.departments ?? []);
  const compareDate = (await listSnapshotDates(30)).find((d) => d < today) ?? null;
  const [live, prev] = await Promise.all([computeReadiness(today), compareDate ? loadSnapshot(compareDate) : Promise.resolve(null)]);
  const now = personReadiness(live, userId, fallback);
  const before = prev ? personReadiness(prev, userId, now.person?.department ?? fallback) : null;
  return NextResponse.json({ date: today, compareDate, ...now, prevPerson: before?.person ?? null, prevTeam: before?.team ?? null });
}

export const GET = guarded("GET /api/readiness/person", 15_000, getHandler);
