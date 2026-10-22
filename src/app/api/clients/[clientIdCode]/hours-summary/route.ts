export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeLogs } from "@/lib/db/schema";
import { timeLogSession } from "@/lib/time-logs/auth";
import { listLoggableClients } from "@/lib/time-logs/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/clients/[code]/hours-summary?from&to — hours logged on this client
 * in the range (default: the current month) vs. its monthly Estimated Hours.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ clientIdCode: string }> }) {
  const me = await timeLogSession();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { clientIdCode } = await params;
  const now = new Date();
  const sp = req.nextUrl.searchParams;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from")! : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const to = DATE.test(sp.get("to") ?? "") ? sp.get("to")! : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

  const where = and(eq(timeLogs.clientIdCode, clientIdCode), gte(timeLogs.entryDate, from), lte(timeLogs.entryDate, to));
  const [byDept, clients] = await Promise.all([
    db
      .select({ department: timeLogs.department, hours: sql<number>`sum(${timeLogs.hours})`.mapWith(Number) })
      .from(timeLogs)
      .where(where)
      .groupBy(timeLogs.department)
      .orderBy(sql`2 desc`),
    listLoggableClients(),
  ]);
  const estimate = clients.find((c) => c.code === clientIdCode)?.estimatedHours ?? null;
  const hours = Math.round(byDept.reduce((a, d) => a + d.hours, 0) * 100) / 100;
  return NextResponse.json({ from, to, hours, monthlyEstimate: estimate, byDepartment: byDept });
}
