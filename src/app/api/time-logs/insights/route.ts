export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timeLogSession } from "@/lib/time-logs/auth";
import { buildInsights } from "@/lib/time-logs/insights";
import { hoursTeamScope } from "@/lib/hours/team-scope";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/time-logs/insights?from&to[&today][&team][&user][&workType][&client]
 * Team-wide hours insights for admins and up; anyone else (or ?mine=1) gets
 * the same report scoped to their own hours, without other people's names or
 * the clients' estimates.
 */
export async function GET(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD with from ≤ to" }, { status: 400 });
  }
  const today = sp.get("today");
  const f = (k: string) => sp.get(k)?.slice(0, 120) || null;
  const day = today && DATE.test(today) ? today : undefined;
  if (!me.teamReports || sp.get("mine") === "1") {
    const mine = await buildInsights(from, to, day, { userId: me.userId, workType: f("workType"), client: f("client") });
    return NextResponse.json({ ...mine, people: [], clientVsEstimate: [] });
  }
  // Admins see their own team; owners / super admins everyone.
  const scope = await hoursTeamScope({ id: me.userId, role: me.role });
  return NextResponse.json(await buildInsights(from, to, day, { team: f("team"), userId: f("user"), userIds: scope ?? undefined, workType: f("workType"), client: f("client") }));
}
