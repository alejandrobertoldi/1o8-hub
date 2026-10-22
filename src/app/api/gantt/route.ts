/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { clientGanttTasks, aac } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

/** GET — summary of gantt progress per client (for the landing page) */
export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      clientIdCode: clientGanttTasks.clientIdCode,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${clientGanttTasks.status} = 'completed')::int`,
      inProgress: sql<number>`count(*) filter (where ${clientGanttTasks.status} = 'in_progress')::int`,
      avgPct: sql<number>`coalesce(avg(${clientGanttTasks.completionPct})::int, 0)`,
    })
    .from(clientGanttTasks)
    .groupBy(clientGanttTasks.clientIdCode);

  // Fetch client names
  const clients = await db
    .select({ clientIdCode: aac.clientIdCode, clientName: aac.clientName, clientType: aac.clientType })
    .from(aac);

  const nameMap = new Map(clients.map((c) => [c.clientIdCode, { name: c.clientName, type: c.clientType }]));

  const result = rows.map((r) => ({
    ...r,
    clientName: nameMap.get(r.clientIdCode)?.name ?? null,
    clientType: nameMap.get(r.clientIdCode)?.type ?? null,
  }));

  return NextResponse.json(result);
}
