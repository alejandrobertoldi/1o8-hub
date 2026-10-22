export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { chicagoToday } from "@/lib/readiness/match";
import { readinessHistory } from "@/lib/readiness/server";

/** GET /api/readiness/history?days=30[&person=<key>] — saved daily totals + departments (+ one person) for the trend chart. */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? 30) || 30, 7), 730);
  const to = chicagoToday();
  const d = new Date(`${to}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  const person = req.nextUrl.searchParams.get("person")?.slice(0, 255) || null;
  return NextResponse.json(await readinessHistory(d.toISOString().slice(0, 10), to, person));
}
