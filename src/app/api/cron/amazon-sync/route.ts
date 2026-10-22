/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  master,
  amazonSnapshots,
  spApiCredentials,
} from "@/lib/db/schema";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { SPAPIClient } from "@/lib/sp-api/client";
import { normalizeCatalogItem } from "@/lib/sp-api/normalizer";
import { compareProductWithAmazon } from "@/lib/sp-api/comparator";

export const maxDuration = 300; // 5 minutes for nightly batch

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all active SP-API credentials
  const allCreds = await db
    .select()
    .from(spApiCredentials)
    .where(eq(spApiCredentials.isActive, true));

  if (allCreds.length === 0) {
    return NextResponse.json({ message: "No active SP-API credentials" });
  }

  const results: {
    client: string;
    total: number;
    compared: number;
    failed: number;
    averageMatch: number;
  }[] = [];

  for (const creds of allCreds) {
    // Fetch products with ASINs for this client
    const productList = await db
      .select()
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, creds.clientIdCode),
          isNotNull(master.asin),
          ne(master.asin, "")
        )
      );

    if (productList.length === 0) {
      results.push({
        client: creds.clientIdCode,
        total: 0,
        compared: 0,
        failed: 0,
        averageMatch: 0,
      });
      continue;
    }

    const client = new SPAPIClient({
      clientId: process.env.SP_API_CLIENT_ID!,
      clientSecret: process.env.SP_API_CLIENT_SECRET!,
      refreshToken: creds.refreshToken,
      marketplaceId: creds.marketplaceId,
      sellerId: creds.sellerId,
      region: creds.region as "na" | "eu" | "fe",
    });

    // Batch fetch catalog items
    const asins = productList.map((p) => p.asin!);
    let catalogItems: Map<string, unknown>;
    try {
      catalogItems = await client.getCatalogItemsBatch(asins);
    } catch (err) {
      console.error(`Cron: Failed batch fetch for ${creds.clientIdCode}:`, err);
      results.push({
        client: creds.clientIdCode,
        total: productList.length,
        compared: 0,
        failed: productList.length,
        averageMatch: 0,
      });
      continue;
    }

    const asinToProduct = new Map(productList.map((p) => [p.asin!, p]));
    let compared = 0;
    let failed = 0;
    const matchScores: number[] = [];

    for (const [asin, catalogItem] of catalogItems.entries()) {
      const product = asinToProduct.get(asin);
      if (!product) continue;

      try {
        const normalizedData = normalizeCatalogItem(catalogItem);
        const comparison = compareProductWithAmazon(product, normalizedData);

        await db.insert(amazonSnapshots).values({
          productId: product.id,
          asin,
          marketplace: product.marketplace,
          normalizedData,
          comparisonResult: comparison,
          overallMatch: comparison.overallMatch,
          fetchedAt: new Date(),
        });

        matchScores.push(comparison.overallMatch);
        compared++;
      } catch (err) {
        console.error(`Cron: Failed to compare ${asin}:`, err);
        failed++;
      }
    }

    // Count ASINs not fetched
    for (const asin of asins) {
      if (!catalogItems.has(asin)) {
        failed++;
      }
    }

    // Update last_sync_at
    await db
      .update(spApiCredentials)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(spApiCredentials.id, creds.id));

    const averageMatch =
      matchScores.length > 0
        ? Math.round(matchScores.reduce((a, b) => a + b, 0) / matchScores.length)
        : 0;

    results.push({
      client: creds.clientIdCode,
      total: productList.length,
      compared,
      failed,
      averageMatch,
    });
  }

  return NextResponse.json({
    syncedAt: new Date().toISOString(),
    clients: results,
  });
}
