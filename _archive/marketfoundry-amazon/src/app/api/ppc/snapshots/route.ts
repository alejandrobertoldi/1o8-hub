import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { ppcSnapshots } from "@/lib/db/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";

export const maxDuration = 30;

/**
 * GET /api/ppc/snapshots?clientIdCode=X&reportType=campaign&start=2026-03-01&end=2026-04-01
 * Returns snapshot history for a client + report type.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (!role || !isEditorOrAbove(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const clientIdCode = searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });
  }

  const reportType = searchParams.get("reportType");
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  const conditions = [eq(ppcSnapshots.clientIdCode, clientIdCode)];
  if (reportType) {
    conditions.push(eq(ppcSnapshots.reportType, reportType as "campaign" | "keyword" | "search_term" | "sqp"));
  }
  if (start) conditions.push(gte(ppcSnapshots.snapshotDate, start));
  if (end) conditions.push(lte(ppcSnapshots.snapshotDate, end));

  const rows = await db
    .select({
      id: ppcSnapshots.id,
      clientIdCode: ppcSnapshots.clientIdCode,
      reportType: ppcSnapshots.reportType,
      snapshotDate: ppcSnapshots.snapshotDate,
      summary: ppcSnapshots.summary,
      deltas: ppcSnapshots.deltas,
      createdAt: ppcSnapshots.createdAt,
    })
    .from(ppcSnapshots)
    .where(and(...conditions))
    .orderBy(desc(ppcSnapshots.snapshotDate))
    .limit(90);

  return NextResponse.json({ snapshots: rows });
}
