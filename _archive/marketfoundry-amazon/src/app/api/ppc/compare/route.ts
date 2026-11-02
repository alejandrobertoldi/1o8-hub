import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { isEditorOrAbove } from "@/lib/roles";
import { db } from "@/lib/db";
import { ppcSnapshots, aac } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export const maxDuration = 30;

/**
 * GET /api/ppc/compare?clientIdCode=X&reportType=campaign
 * Returns the two most recent snapshots + their deltas for quick period-over-period view.
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
  const reportType = searchParams.get("reportType") || "campaign";

  if (!clientIdCode) {
    return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });
  }

  const rows = await db
    .select({
      id: ppcSnapshots.id,
      snapshotDate: ppcSnapshots.snapshotDate,
      summary: ppcSnapshots.summary,
      deltas: ppcSnapshots.deltas,
      data: ppcSnapshots.data,
    })
    .from(ppcSnapshots)
    .where(
      and(
        eq(ppcSnapshots.clientIdCode, clientIdCode),
        eq(ppcSnapshots.reportType, reportType as "campaign" | "keyword" | "search_term" | "sqp")
      )
    )
    .orderBy(desc(ppcSnapshots.snapshotDate))
    .limit(2);

  if (rows.length === 0) {
    return NextResponse.json({ error: "No snapshots found", current: null, previous: null, goals: null });
  }

  // Fetch client goals from AAC rawData
  const [client] = await db
    .select({ rawData: aac.rawData })
    .from(aac)
    .where(eq(aac.clientIdCode, clientIdCode))
    .limit(1);

  let goals: Record<string, number> | null = null;
  if (client?.rawData) {
    const raw = typeof client.rawData === "string" ? JSON.parse(client.rawData) : (client.rawData as Record<string, string>);
    const goalMap: Record<string, string> = {
      ACOSGoal1W: "acos",
      ROASGoal1W: "roas",
      ADSpendBudget1W: "spend",
      SalesForecast1W: "revenue",
    };
    goals = {};
    for (const [key, metric] of Object.entries(goalMap)) {
      const v = raw[key];
      if (v && v !== "N/A" && !String(v).includes("#")) {
        const n = parseFloat(String(v).replace(/[%$,]/g, ""));
        if (!isNaN(n)) goals[metric] = n;
      }
    }
    if (Object.keys(goals).length === 0) goals = null;
  }

  return NextResponse.json({
    current: rows[0],
    previous: rows[1] || null,
    hasComparison: rows.length === 2,
    goals,
  });
}
