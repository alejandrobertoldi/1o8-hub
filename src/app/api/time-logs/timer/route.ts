export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeLogTimers, type TimeLogTimer } from "@/lib/db/schema";
import { timeLogSession } from "@/lib/time-logs/auth";
import { timerSeconds } from "@/lib/time-logs/timer";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the browser needs: seconds as of this response, so its clock doesn't matter. */
const view = (t: TimeLogTimer | undefined) =>
  t ? { running: !!t.startedAt, seconds: timerSeconds(t), entryDate: t.entryDate } : null;

async function load(userId: string) {
  const [t] = await db.select().from(timeLogTimers).where(eq(timeLogTimers.userId, userId)).limit(1);
  return t;
}

/** GET /api/time-logs/timer — my timer, or null. */
export async function GET() {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ timer: view(await load(me.userId)) });
}

/**
 * POST /api/time-logs/timer { action: start | pause | resume | stop | discard, entryDate? }.
 * The timer is personal: it never touches anyone else's. "stop" removes it and
 * returns the total seconds; the browser turns that into hours on the form.
 */
export async function POST(req: NextRequest) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { action?: string; entryDate?: string } | null;
  const now = new Date();
  const t = await load(me.userId);
  const where = eq(timeLogTimers.userId, me.userId);

  switch (body?.action) {
    case "start": {
      if (t) return NextResponse.json({ error: "A timer is already going" }, { status: 409 });
      if (!DATE.test(body.entryDate ?? "")) return NextResponse.json({ error: "entryDate must be YYYY-MM-DD" }, { status: 400 });
      const [row] = await db.insert(timeLogTimers).values({ userId: me.userId, startedAt: now, elapsedSeconds: 0, entryDate: body.entryDate! }).returning();
      return NextResponse.json({ timer: view(row) });
    }
    case "pause": {
      if (!t?.startedAt) return NextResponse.json({ timer: view(t) });
      const [row] = await db.update(timeLogTimers).set({ startedAt: null, elapsedSeconds: timerSeconds(t, now.getTime()), updatedAt: now }).where(where).returning();
      return NextResponse.json({ timer: view(row) });
    }
    case "resume": {
      if (!t || t.startedAt) return NextResponse.json({ timer: view(t) });
      const [row] = await db.update(timeLogTimers).set({ startedAt: now, updatedAt: now }).where(where).returning();
      return NextResponse.json({ timer: view(row) });
    }
    case "stop": {
      if (!t) return NextResponse.json({ error: "No timer is going" }, { status: 404 });
      await db.delete(timeLogTimers).where(where);
      return NextResponse.json({ timer: null, seconds: timerSeconds(t, now.getTime()), entryDate: t.entryDate });
    }
    case "discard":
      await db.delete(timeLogTimers).where(where);
      return NextResponse.json({ timer: null });
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
