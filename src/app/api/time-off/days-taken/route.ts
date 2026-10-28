import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { canApproveTimeOff, canSubmitTimeOff } from "@/lib/time-off/guards";
import { getDaysTakenByUser, getDaysTakenBreakdown } from "@/lib/time-off/queries";

export const dynamic = "force-dynamic";

// GET /api/time-off/days-taken?year=2026 — own days for every caller who can
// submit time off; breakdown additionally for the approver (spec §4.3).
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!canSubmitTimeOff(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const yearRaw = req.nextUrl.searchParams.get("year");
  const year = Number(yearRaw);
  if (!yearRaw || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year is out of range" }, { status: 400 });
  }

  const ownDays = await getDaysTakenByUser(session.user.id, year);

  if (!canApproveTimeOff(session.user.role)) {
    return NextResponse.json({ year, ownDays });
  }

  const breakdown = await getDaysTakenBreakdown(year);
  return NextResponse.json({ year, ownDays, breakdown });
}
