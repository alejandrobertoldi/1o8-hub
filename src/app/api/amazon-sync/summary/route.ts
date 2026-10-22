/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  amazonSyncDiscrepancies,
  amazonSyncSnapshots,
  amazonSyncRuns,
  master,
  aac,
} from "@/lib/db/schema";
import { eq, sql, and, ne, desc } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("client_id");

  // Discrepancy summary per client
  const discBySummary = await db
    .select({
      clientIdCode: amazonSyncDiscrepancies.clientIdCode,
      total: sql<number>`count(*)`,
      mismatches: sql<number>`count(*) filter (where ${amazonSyncDiscrepancies.status} != 'match')`,
      unresolved: sql<number>`count(*) filter (where ${amazonSyncDiscrepancies.status} != 'match' and ${amazonSyncDiscrepancies.resolved} = false)`,
    })
    .from(amazonSyncDiscrepancies)
    .groupBy(amazonSyncDiscrepancies.clientIdCode);

  // Last sync per client
  const lastSyncs = await db
    .select({
      clientIdCode: amazonSyncRuns.clientIdCode,
      lastSync: sql<string>`max(${amazonSyncRuns.completedAt})`,
    })
    .from(amazonSyncRuns)
    .where(eq(amazonSyncRuns.status, "completed"))
    .groupBy(amazonSyncRuns.clientIdCode);

  // Get active client codes from AAC table
  const activeClients = await db
    .select({ clientIdCode: aac.clientIdCode })
    .from(aac)
    .where(eq(aac.clientStatus, "Active"));
  const activeClientCodes = new Set(activeClients.map((c) => c.clientIdCode));

  // Product counts with ASINs per client (active only)
  const productCounts = await db
    .select({
      clientIdCode: master.clientIdCode,
      count: sql<number>`count(*)`,
    })
    .from(master)
    .where(sql`${master.asin} IS NOT NULL AND ${master.asin} != '' AND ${master.status} = 'Active' AND lower(${master.parentageLevel}) != 'parent'`)
    .groupBy(master.clientIdCode)
    .then((rows) => rows.filter((r) => r.clientIdCode && activeClientCodes.has(r.clientIdCode)));

  // If client_id specified, get per-product summary
  let productSummary: Array<{
    productId: string;
    asin: string;
    sku: string | null;
    title: string | null;
    parentageLevel: string | null;
    parentAsin: string | null;
    lastSynced: string | null;
    mismatches: number;
    thumbnailUrl: string | null;
  }> = [];

  if (clientIdCode) {
    const perProduct = await db
      .select({
        productId: master.id,
        asin: master.asin,
        sku: master.sku,
        title: master.itemName,
        thumbnailUrl: master.mainImageUrl,
        parentageLevel: master.parentageLevel,
        parentAsin: master.parentAsin,
      })
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, clientIdCode),
          eq(master.status, "Active"),
          sql`${master.asin} IS NOT NULL AND ${master.asin} != ''`,
          sql`lower(${master.parentageLevel}) != 'parent'`
        )
      );

    // Get last snapshot + discrepancy counts per product
    for (const p of perProduct) {
      const [lastSnapshot] = await db
        .select({ fetchedAt: amazonSyncSnapshots.fetchedAt })
        .from(amazonSyncSnapshots)
        .where(eq(amazonSyncSnapshots.productId, p.productId))
        .orderBy(desc(amazonSyncSnapshots.fetchedAt))
        .limit(1);

      const [discCount] = await db
        .select({
          count: sql<number>`count(*) filter (where ${amazonSyncDiscrepancies.status} != 'match' and ${amazonSyncDiscrepancies.resolved} = false)`,
        })
        .from(amazonSyncDiscrepancies)
        .where(eq(amazonSyncDiscrepancies.productId, p.productId));

      productSummary.push({
        productId: p.productId,
        asin: p.asin ?? "",
        sku: p.sku ?? null,
        title: p.title,
        parentageLevel: p.parentageLevel ?? null,
        parentAsin: p.parentAsin ?? null,
        lastSynced: lastSnapshot?.fetchedAt?.toISOString() ?? null,
        mismatches: Number(discCount?.count ?? 0),
        thumbnailUrl: p.thumbnailUrl,
      });
    }
  }

  return NextResponse.json({
    clients: discBySummary.map((d) => ({
      clientIdCode: d.clientIdCode,
      totalFields: Number(d.total),
      mismatches: Number(d.mismatches),
      unresolved: Number(d.unresolved),
      lastSync:
        lastSyncs.find((s) => s.clientIdCode === d.clientIdCode)?.lastSync ??
        null,
      productCount:
        Number(
          productCounts.find((c) => c.clientIdCode === d.clientIdCode)
            ?.count ?? 0
        ),
    })),
    allClients: productCounts.map((c) => ({
      clientIdCode: c.clientIdCode,
      productCount: Number(c.count),
      lastSync:
        lastSyncs.find((s) => s.clientIdCode === c.clientIdCode)?.lastSync ??
        null,
      unresolved: Number(
        discBySummary.find((d) => d.clientIdCode === c.clientIdCode)
          ?.unresolved ?? 0
      ),
    })),
    products: productSummary,
  });
}
