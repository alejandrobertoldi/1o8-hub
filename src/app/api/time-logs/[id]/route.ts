export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminEventLog, timeLogs } from "@/lib/db/schema";
import { timeLogSession } from "@/lib/time-logs/auth";
import { resolveTimeLog, timeLogInputSchema } from "@/lib/time-logs/server";

type Ctx = { params: Promise<{ id: string }> };

async function loadOwned(id: string) {
  const me = await timeLogSession();
  if (!me) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const [row] = await db.select().from(timeLogs).where(eq(timeLogs.id, id)).limit(1);
  if (!row) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (row.userId !== me.userId && !me.isAdmin) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { row, me };
}

/** PATCH — edit an entry (full entry in the body). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { row, error } = await loadOwned(id);
  if (error) return error;
  const parsed = timeLogInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const resolved = await resolveTimeLog(parsed.data, row);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 });
  const { hours, ...rest } = resolved.values;
  const [updated] = await db
    .update(timeLogs)
    .set({ ...rest, hours: String(hours), updatedAt: new Date() })
    .where(eq(timeLogs.id, id))
    .returning();
  return NextResponse.json(updated);
}

/**
 * DELETE — removes an entry. The whole row goes to admin_event_log first
 * (action "time-log:delete", resourceId = whose hours), so a deletion can be
 * traced and the entry put back (npm run hours:lookup).
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { row, me, error } = await loadOwned(id);
  if (error) return error;
  await db.delete(timeLogs).where(eq(timeLogs.id, id));
  await db
    .insert(adminEventLog)
    .values({
      userEmail: me.email,
      userName: me.name,
      section: "hours",
      action: "time-log:delete",
      resourceType: "time_log",
      resourceId: row.userId,
      resourceLabel: `${row.entryDate} ${row.clientIdCode} ${row.projectNumber}`,
      message: `Deleted ${row.hours} h on ${row.entryDate} (${row.clientIdCode} ${row.projectNumber}, ${row.department})${row.userId === me.userId ? "" : " for someone else"}`,
      detail: { entry: row },
    })
    .catch(() => {}); // best-effort: the delete already happened
  return NextResponse.json({ ok: true });
}
