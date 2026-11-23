export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { getReport } from "@/lib/client-report/load";
import { isPeriod } from "@/lib/client-report/period";

/** GET — a client's saved report for the month (404 until it's generated). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string; period: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isHubStaff(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { code, period } = await params;
  if (!isPeriod(period)) return NextResponse.json({ error: "Bad period" }, { status: 400 });
  const row = await getReport(code, period);
  if (!row) return NextResponse.json({ error: "Not generated yet" }, { status: 404 });
  return NextResponse.json({ status: row.status, generatedAt: row.generatedAt, dataThrough: row.dataThrough, data: row.data });
}
