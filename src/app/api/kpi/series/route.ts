import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { isDateString } from "@/lib/time-off/working-days";
import { kpiSeries } from "@/lib/kpi/series";

export const dynamic = "force-dynamic";

/** GET ?client=&start=&end= — KPI report data (range, previous period, last year, daily). */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const client = p.get("client")?.trim().toUpperCase();
  const start = p.get("start");
  const end = p.get("end");
  if (!client || !isDateString(start) || !isDateString(end) || end < start) {
    return NextResponse.json({ error: "client, start and end (YYYY-MM-DD) are required" }, { status: 400 });
  }
  return NextResponse.json(await kpiSeries(client, start, end));
}
