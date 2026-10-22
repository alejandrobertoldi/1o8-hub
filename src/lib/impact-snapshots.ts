/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/async-await-in-loop */
import { db } from "@/lib/db";
import { contentImpactSnapshots, salesSummaryCache } from "@/lib/db/schema";
import { and, eq, lte, isNull } from "drizzle-orm";

const MAX_CACHE_AGE_MS = 12 * 60 * 60 * 1000; // 12h — looser than sales cache since we just need a recent snapshot

export interface SalesMetricsSnapshot {
  [key: string]: number;
  product_sales: number;
  ad_spend: number;
  ad_revenue: number;
  ordered_units: number;
  ordered_revenue: number;
  glance_view_byasin: number;
  ad_impressions: number;
  ad_clicks: number;
}

/**
 * Extract client-level sales metrics from the most recent sales summary cache.
 * Returns null if no recent cache entry exists.
 */
async function getClientMetricsFromCache(
  clientIdCode: string
): Promise<SalesMetricsSnapshot | null> {
  // Find the most recent summary cache entry
  const rows = await db
    .select({ data: salesSummaryCache.data, updatedAt: salesSummaryCache.updatedAt })
    .from(salesSummaryCache)
    .where(eq(salesSummaryCache.cacheType, "summary"))
    .orderBy(salesSummaryCache.updatedAt)
    .limit(5);

  for (const row of rows.reverse()) {
    const age = Date.now() - new Date(row.updatedAt).getTime();
    if (age > MAX_CACHE_AGE_MS) continue;

    const data = row.data as { clients?: Array<{ clientIdCode: string; current?: Record<string, number> }> };
    if (!data?.clients) continue;

    const client = data.clients.find((c) => c.clientIdCode === clientIdCode);
    if (!client?.current) continue;

    const m = client.current;
    return {
      product_sales: m.product_sales ?? 0,
      ad_spend: m.ad_spend ?? 0,
      ad_revenue: m.ad_revenue ?? 0,
      ordered_units: m.ordered_units ?? 0,
      ordered_revenue: m.ordered_revenue ?? 0,
      glance_view_byasin: m.glance_view_byasin ?? 0,
      ad_impressions: m.ad_impressions ?? 0,
      ad_clicks: m.ad_clicks ?? 0,
    };
  }

  return null;
}

/**
 * Create an impact snapshot when content changes are made.
 * Tries to fill "before" metrics from the sales cache immediately.
 */
export async function createImpactSnapshot(params: {
  clientIdCode: string;
  productId?: string;
  asin?: string;
  changeType: "product_edit" | "aplus_update" | "bulk_edit";
  changeSummary: string;
  changeCount: number;
  changedBy: string;
}): Promise<void> {
  const beforeMetrics = await getClientMetricsFromCache(params.clientIdCode);

  await db.insert(contentImpactSnapshots).values({
    clientIdCode: params.clientIdCode,
    productId: params.productId ?? null,
    asin: params.asin ?? null,
    changeType: params.changeType,
    changeSummary: params.changeSummary,
    changeCount: params.changeCount,
    changedBy: params.changedBy,
    changedAt: new Date(),
    beforeMetrics: beforeMetrics ?? undefined,
    beforeSnapshotAt: beforeMetrics ? new Date() : null,
    status: beforeMetrics ? "pending_after" : "pending_before",
  });
}

/**
 * Called during sales dashboard loads to fill missing snapshots.
 * - Fill "before" for pending_before snapshots (recent changes without cached data at creation time)
 * - Fill "after" for pending_after snapshots where the impact window has elapsed
 */
export async function fillPendingSnapshots(
  clientIdCode: string,
  currentMetrics: SalesMetricsSnapshot
): Promise<void> {
  const now = new Date();

  // 1. Fill "before" for snapshots that didn't have cache at creation time
  const pendingBefore = await db
    .select({ id: contentImpactSnapshots.id })
    .from(contentImpactSnapshots)
    .where(
      and(
        eq(contentImpactSnapshots.clientIdCode, clientIdCode),
        eq(contentImpactSnapshots.status, "pending_before")
      )
    );

  for (const row of pendingBefore) {
    await db
      .update(contentImpactSnapshots)
      .set({
        beforeMetrics: currentMetrics,
        beforeSnapshotAt: now,
        status: "pending_after",
      })
      .where(eq(contentImpactSnapshots.id, row.id));
  }

  // 2. Fill "after" for snapshots past their impact window
  const windowCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const pendingAfter = await db
    .select({ id: contentImpactSnapshots.id })
    .from(contentImpactSnapshots)
    .where(
      and(
        eq(contentImpactSnapshots.clientIdCode, clientIdCode),
        eq(contentImpactSnapshots.status, "pending_after"),
        lte(contentImpactSnapshots.changedAt, windowCutoff)
      )
    );

  for (const row of pendingAfter) {
    await db
      .update(contentImpactSnapshots)
      .set({
        afterMetrics: currentMetrics,
        afterSnapshotAt: now,
        status: "complete",
      })
      .where(eq(contentImpactSnapshots.id, row.id));
  }
}
