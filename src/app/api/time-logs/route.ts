export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeLogs } from "@/lib/db/schema";
import { timeLogSession } from "@/lib/time-logs/auth";
import { resolveTimeLog, timeLogInputSchema } from "@/lib/time-logs/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/time-logs?from=YYYY-MM-DD&to=YYYY-MM-DD[&userId=] — own logs; admins may pass userId. */
export async function GET(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to)) return NextResponse.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  const userId = sp.get("userId") || me.userId;
  if (userId !== me.userId && !me.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db
    .select()
    .from(timeLogs)
    .where(and(eq(timeLogs.userId, userId), gte(timeLogs.entryDate, from), lte(timeLogs.entryDate, to)))
    .orderBy(asc(timeLogs.entryDate), asc(timeLogs.createdAt));
  return NextResponse.json(rows);
}

/** POST /api/time-logs — log time (admins may log for someone else via userId). */
export async function POST(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = timeLogInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const userId = typeof body?.userId === "string" && body.userId ? body.userId : me.userId;
  if (userId !== me.userId && !me.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const resolved = await resolveTimeLog(parsed.data);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const { hours, ...rest } = resolved.values;
  const [row] = await db.insert(timeLogs).values({ ...rest, hours: String(hours), userId }).returning();
  return NextResponse.json(row, { status: 201 });
}
