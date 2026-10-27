export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { chicagoToday } from "@/lib/readiness/match";
import { GO_LIVE_WINDOW_DAYS, goLiveSoon, watchedDepartments } from "@/lib/readiness/go-live";
import { guarded } from "@/lib/db/guarded-route";

/**
 * GET /api/readiness/go-live?user=<id> — open tasks of the departments a
 * person leads (plus their own) whose Go Live Date is within the next
 * GO_LIVE_WINDOW_DAYS days or recently passed (My Dashboard). Defaults to the
 * signed-in user. Staff only, like the Readiness board.
 */
async function getHandler(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = req.nextUrl.searchParams.get("user") || session.user.id;
  const today = chicagoToday();
  const { departments, leads } = await watchedDepartments(userId);
  const tasks = await goLiveSoon(departments, today);
  return NextResponse.json({ today, days: GO_LIVE_WINDOW_DAYS, departments, leads, tasks });
}

export const GET = guarded("GET /api/readiness/go-live", 15_000, getHandler);
