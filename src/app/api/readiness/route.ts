export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isHubStaff } from "@/lib/roles";
import { chicagoToday } from "@/lib/readiness/match";
import { captureSnapshot, computeReadiness, listSnapshotDates, loadSnapshot } from "@/lib/readiness/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const shift = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/**
 * GET /api/readiness?compare=yesterday|7d|30d|YYYY-MM-DD — the live board plus
 * the saved snapshot to compare against (the closest saved day on or before
 * the requested one). If today has no snapshot yet and it's past 6 am in
 * Chicago, today's is captured on the spot — a fallback for the morning cron.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !isHubStaff(session.user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = chicagoToday();
  const chicagoHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  let dates = await listSnapshotDates();
  if (!dates.includes(today) && chicagoHour >= 6) {
    await captureSnapshot();
    dates = await listSnapshotDates();
  }

  const c = req.nextUrl.searchParams.get("compare") ?? "yesterday";
  const target = DATE.test(c) ? c : shift(today, c === "30d" ? 30 : c === "7d" ? 7 : 1);
  const compareDate = dates.find((d) => d <= target) ?? null;

  const [live, compare] = await Promise.all([computeReadiness(today), compareDate ? loadSnapshot(compareDate) : Promise.resolve(null)]);
  return NextResponse.json({ live, compare, compareDate, snapshotDates: dates });
}
