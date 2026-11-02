/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { contentImpactSnapshots } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("client");
  const productId = req.nextUrl.searchParams.get("productId");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20"), 100);

  // Client-role users can only see their own data
  let effectiveClientFilter = clientIdCode;
  if (session.user.role === "client" && session.user.clientIdCode) {
    const allowedCodes = (session.user.clientIdCode as string).split(",").map((s: string) => s.trim()).filter(Boolean);
    if (clientIdCode && !allowedCodes.includes(clientIdCode)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // Force-filter to first allowed code when no client param provided
    if (!clientIdCode && allowedCodes.length > 0) {
      effectiveClientFilter = allowedCodes[0];
    }
  }

  const conditions = [];
  if (effectiveClientFilter) {
    conditions.push(eq(contentImpactSnapshots.clientIdCode, effectiveClientFilter));
  }
  if (productId) {
    conditions.push(eq(contentImpactSnapshots.productId, productId));
  }

  const snapshots = await db
    .select()
    .from(contentImpactSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(contentImpactSnapshots.changedAt))
    .limit(limit);

  // Compute deltas for complete snapshots
  const results = snapshots.map((s) => {
    let deltas: Record<string, { before: number; after: number; change: number; changePct: number | null }> | null = null;

    if (s.status === "complete" && s.beforeMetrics && s.afterMetrics) {
      deltas = {};
      const before = s.beforeMetrics as Record<string, number>;
      const after = s.afterMetrics as Record<string, number>;
      for (const key of Object.keys(before)) {
        const b = before[key] ?? 0;
        const a = after[key] ?? 0;
        deltas[key] = {
          before: b,
          after: a,
          change: a - b,
          changePct: b > 0 ? ((a - b) / b) * 100 : null,
        };
      }
    }

    return { ...s, deltas };
  });

  return NextResponse.json({ snapshots: results });
}
