export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isOwner } from "@/lib/roles";
import { isDateString } from "@/lib/time-off/working-days";
import { salesSummary } from "@/lib/kpi/sales-summary-server";

/** GET ?start&end — every active client's sales, traffic, paid media and email for the range (owners only). */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(session.user.role)) return NextResponse.json({ error: "Only owners can see the Sales Summary" }, { status: 403 });
  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!isDateString(start) || !isDateString(end) || end < start) {
    return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });
  }
  return NextResponse.json(await salesSummary(start, end));
}
