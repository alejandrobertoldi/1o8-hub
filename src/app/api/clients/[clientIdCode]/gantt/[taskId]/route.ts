/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientGanttTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pushTaskToAsana, markAsanaTaskOnDelete } from "@/lib/asana-sync";

type RouteCtx = { params: Promise<{ clientIdCode: string; taskId: string }> };

/** PATCH — update a single gantt task */
export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { clientIdCode, taskId } = await params;
  const body = await req.json();

  // Track which fields are changing (for Asana sync)
  const changedFields: string[] = [];

  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) { allowed.status = body.status; changedFields.push("status"); }
  if (body.completionPct !== undefined) allowed.completionPct = body.completionPct;
  if (body.notes !== undefined) allowed.notes = body.notes;
  if (body.assignedTo !== undefined) { allowed.assignedTo = body.assignedTo; changedFields.push("assignedTo"); }
  if (body.weekStart !== undefined) allowed.weekStart = body.weekStart;
  if (body.weekEnd !== undefined) allowed.weekEnd = body.weekEnd;
  if (body.taskName !== undefined) allowed.taskName = body.taskName;
  if (body.subtaskTitle !== undefined) allowed.subtaskTitle = body.subtaskTitle;
  if (body.section !== undefined) allowed.section = body.section;
  if (body.portalHidden !== undefined) allowed.portalHidden = Boolean(body.portalHidden);
  if (body.startDay !== undefined) {
    allowed.startDay = Number(body.startDay);
    allowed.weekStart = Math.ceil(Number(body.startDay) / 7);
    changedFields.push("startDay");
  }
  if (body.durationDays !== undefined) {
    allowed.durationDays = Number(body.durationDays);
    changedFields.push("durationDays");
  }
  // Recompute weekEnd when startDay or durationDays change
  if (body.startDay !== undefined || body.durationDays !== undefined) {
    const sd = Number(body.startDay ?? allowed.startDay ?? 1);
    const dur = Number(body.durationDays ?? allowed.durationDays ?? 0);
    allowed.weekEnd = Math.ceil((sd + Math.max(dur - 1, 0)) / 7);
  }

  if (body.status === "in_progress" && !body.startedAt) {
    allowed.startedAt = new Date();
  }
  if (body.status === "completed") {
    allowed.completedAt = new Date();
    allowed.completionPct = 100;
  }

  allowed.updatedAt = new Date();

  const [updated] = await db
    .update(clientGanttTasks)
    .set(allowed)
    .where(eq(clientGanttTasks.id, Number(taskId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Push changes to Asana (fire-and-forget, don't block response)
  if (changedFields.length > 0) {
    pushTaskToAsana(
      {
        asanaTaskGid: updated.asanaTaskGid,
        status: updated.status,
        assignedTo: updated.assignedTo,
        startDay: updated.startDay,
        durationDays: updated.durationDays,
        clientIdCode,
      },
      changedFields
    ).catch((err) => console.error("[AsanaSync] push error:", err));
  }

  return NextResponse.json(updated);
}

/** DELETE — remove a gantt task */
export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;

  const [deleted] = await db
    .delete(clientGanttTasks)
    .where(eq(clientGanttTasks.id, Number(taskId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Mark the Asana task as completed. Deferred with after(), not fired-and-forgotten:
  // an un-awaited call is abandoned when Vercel freezes the sandbox, so the task would
  // silently stay open in Asana with no error logged anywhere. No Postgres traffic here,
  // so this cannot wedge a pool slot — the failure mode is a dropped side effect.
  // See src/lib/sales-cache.awaited.test.ts.
  after(async () => {
    await markAsanaTaskOnDelete(deleted.asanaTaskGid);
  });

  return NextResponse.json({ ok: true });
}
