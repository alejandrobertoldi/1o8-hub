export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, asanaSyncState, asanaTasks } from "@/lib/db/schema";

/**
 * Open-task snapshot for one client, read from the local asana_tasks mirror
 * (filled by the My Dashboard Asana sync, src/lib/my-dashboard/asana-sync.ts).
 * `today` comes from the browser (YYYY-MM-DD) so "due today" / "overdue"
 * follow the viewer's calendar day, not the server's UTC date.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ clientIdCode: string }> }) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;

  const todayParam = req.nextUrl.searchParams.get("today") ?? "";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(todayParam) ? todayParam : new Date().toISOString().slice(0, 10);

  const open = and(eq(asanaTasks.clientIdCode, clientIdCode), eq(asanaTasks.completed, false));

  const [[counts], next, [syncState], [client]] = await Promise.all([
    db
      .select({
        open: sql<number>`count(*)`.mapWith(Number),
        dueToday: sql<number>`count(*) filter (where ${asanaTasks.dueOn} = ${today})`.mapWith(Number),
        overdue: sql<number>`count(*) filter (where ${asanaTasks.dueOn} < ${today})`.mapWith(Number),
        noDueDate: sql<number>`count(*) filter (where ${asanaTasks.dueOn} is null)`.mapWith(Number),
      })
      .from(asanaTasks)
      .where(open),
    // Most urgent first: overdue and due-today float to the top, undated last.
    db
      .select({
        gid: asanaTasks.gid,
        name: asanaTasks.name,
        dueOn: asanaTasks.dueOn,
        assigneeName: asanaTasks.assigneeName,
        permalinkUrl: asanaTasks.permalinkUrl,
      })
      .from(asanaTasks)
      .where(open)
      .orderBy(sql`${asanaTasks.dueOn} asc nulls last`, asc(asanaTasks.name))
      .limit(5),
    db.select({ lastSuccessAt: asanaSyncState.lastSuccessAt }).from(asanaSyncState).limit(1),
    db.select({ asanaProjectGid: aac.asanaProjectGid }).from(aac).where(eq(aac.clientIdCode, clientIdCode)).limit(1),
  ]);

  return NextResponse.json({
    connected: !!syncState?.lastSuccessAt,
    lastSyncAt: syncState?.lastSuccessAt?.toISOString() ?? null,
    today,
    open: counts?.open ?? 0,
    dueToday: counts?.dueToday ?? 0,
    overdue: counts?.overdue ?? 0,
    noDueDate: counts?.noDueDate ?? 0,
    next,
    projectUrl: client?.asanaProjectGid ? `https://app.asana.com/0/${client.asanaProjectGid}` : null,
  });
}
