export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { timeLogSession } from "@/lib/time-logs/auth";
import { holidaysForUser } from "@/lib/time-logs/holidays";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/time-logs/holidays?from&to[&userId] — the holidays on someone's calendar (yours by default), which aren't workdays. */
export async function GET(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  const userId = sp.get("userId") || me.userId;
  if (userId !== me.userId && !me.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await holidaysForUser(userId, from, to));
}
