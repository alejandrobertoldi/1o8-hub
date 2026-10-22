export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timeLogSession } from "@/lib/time-logs/auth";
import { buildInsights } from "@/lib/time-logs/insights";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/time-logs/insights?from&to[&today][&team][&user][&workType][&client] — team-wide hours insights (admins). */
export async function GET(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: "Only admins can see team-wide insights" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: "from and to must be YYYY-MM-DD with from ≤ to" }, { status: 400 });
  }
  const today = sp.get("today");
  const f = (k: string) => sp.get(k)?.slice(0, 120) || null;
  return NextResponse.json(
    await buildInsights(from, to, today && DATE.test(today) ? today : undefined, { team: f("team"), userId: f("user"), workType: f("workType"), client: f("client") }),
  );
}
