/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contentImpactSnapshots, salesSummaryCache } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { fillPendingSnapshots, type SalesMetricsSnapshot } from "@/lib/impact-snapshots";

export const maxDuration = 120;

/**
 * Daily cron safety net for impact snapshot processing.
 * Finds all clients with pending snapshots and fills them using
 * the most recent sales summary cache data.
 * Primary fill happens during sales dashboard loads (sales-summary API);
 * this cron ensures snapshots are processed even if nobody views the dashboard.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find distinct clients with pending snapshots
    const pendingRows = await db
      .selectDistinct({ clientIdCode: contentImpactSnapshots.clientIdCode })
      .from(contentImpactSnapshots)
      .where(
        or(
          eq(contentImpactSnapshots.status, "pending_before"),
          eq(contentImpactSnapshots.status, "pending_after")
        )
      );

    if (pendingRows.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending snapshots" });
    }

    // Get the most recent sales summary cache
    const cacheRows = await db
      .select({ data: salesSummaryCache.data, updatedAt: salesSummaryCache.updatedAt })
      .from(salesSummaryCache)
      .where(eq(salesSummaryCache.cacheType, "summary"))
      .orderBy(salesSummaryCache.updatedAt)
      .limit(5);

    // Find the freshest cache entry (within 24h for cron — looser than the 12h lib threshold)
    type CacheShape = { clients?: Array<{ clientIdCode: string; current?: Record<string, number> }> };
    let cacheData: CacheShape | null = null;
    for (const row of cacheRows.reverse()) {
      const age = Date.now() - new Date(row.updatedAt).getTime();
      if (age > 24 * 60 * 60 * 1000) continue;
      const data = row.data as CacheShape;
      if (data?.clients) {
        cacheData = data;
        break;
      }
    }

    if (!cacheData?.clients) {
      return NextResponse.json({
        processed: 0,
        pendingClients: pendingRows.length,
        message: "No recent sales cache available",
      });
    }

    let filled = 0;
    const errors: string[] = [];

    for (const { clientIdCode } of pendingRows) {
      const client = cacheData.clients.find((c) => c.clientIdCode === clientIdCode);
      if (!client?.current) continue;

      const metrics: SalesMetricsSnapshot = {
        product_sales: client.current.product_sales ?? 0,
        ad_spend: client.current.ad_spend ?? 0,
        ad_revenue: client.current.ad_revenue ?? 0,
        ordered_units: client.current.ordered_units ?? 0,
        ordered_revenue: client.current.ordered_revenue ?? 0,
        glance_view_byasin: client.current.glance_view_byasin ?? 0,
        ad_impressions: client.current.ad_impressions ?? 0,
        ad_clicks: client.current.ad_clicks ?? 0,
      };

      try {
        await fillPendingSnapshots(clientIdCode, metrics);
        filled++;
      } catch (err) {
        errors.push(`${clientIdCode}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    return NextResponse.json({
      processed: filled,
      pendingClients: pendingRows.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Impact cron error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
