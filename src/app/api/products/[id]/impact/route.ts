import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentImpactSnapshots } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  const canProducts = canAccessSection(session, "products");
  const isClient = role === "client";

  if (!canProducts && !isClient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: productId } = await params;

  // Fetch recent impact snapshots for this product
  const snapshots = await db
    .select()
    .from(contentImpactSnapshots)
    .where(eq(contentImpactSnapshots.productId, productId))
    .orderBy(desc(contentImpactSnapshots.changedAt));

  // If client, verify ownership
  if (isClient) {
    const clientCode = session.user.clientIdCode;
    if (!clientCode) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const hasOwnership = snapshots.length === 0 || snapshots[0].clientIdCode === clientCode;
    if (!hasOwnership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (snapshots.length === 0) {
    return NextResponse.json({
      status: "no_baseline",
      snapshots: [],
    });
  }

  const latest = snapshots[0];

  // Compute deltas if both before and after metrics are available
  const computeDelta = (key: string) => {
    const before = latest.beforeMetrics?.[key] ?? null;
    const after = latest.afterMetrics?.[key] ?? null;
    if (before === null || after === null) return null;
    if (before === 0) return { absolute: after, percentage: null };
    const pct = Math.round(((after - before) / before) * 100);
    return { absolute: after - before, percentage: pct };
  };

  return NextResponse.json({
    status: latest.status,
    before: latest.beforeMetrics,
    after: latest.afterMetrics,
    delta: latest.afterMetrics
      ? {
          units: computeDelta("avgDailyUnits"),
          revenue: computeDelta("avgDailyRevenue"),
          sessions: computeDelta("avgDailySessions"),
        }
      : null,
    changedAt: latest.changedAt,
    changeSummary: latest.changeSummary,
    impactWindowDays: latest.impactWindowDays,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      changeType: s.changeType,
      changeSummary: s.changeSummary,
      status: s.status,
      changedAt: s.changedAt,
    })),
  });
}
