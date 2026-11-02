import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
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

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminPowers(session.user.role)) {
    return NextResponse.json(
      { error: "Forbidden: admin only" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { clientIdCode, maxProducts: maxParam } = body as {
    clientIdCode: string;
    maxProducts?: number;
  };

  if (!clientIdCode) {
    return NextResponse.json(
      { error: "clientIdCode is required" },
      { status: 400 }
    );
  }

  const maxProducts = Math.min(Math.max(maxParam ?? 100, 1), 500);

  // Fetch credentials
  const [creds] = await db
    .select()
    .from(spApiCredentials)
    .where(
      and(
        eq(spApiCredentials.clientIdCode, clientIdCode),
        eq(spApiCredentials.isActive, true)
      )
    )
    .limit(1);

  if (!creds) {
    return NextResponse.json(
      { error: `No SP-API credentials configured for client ${clientIdCode}` },
      { status: 400 }
    );
  }

  // Fetch products with non-empty ASINs
  const productList = await db
    .select()
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, clientIdCode),
        isNotNull(master.asin),
        ne(master.asin, "")
      )
    )
    .limit(maxProducts);

  if (productList.length === 0) {
    return NextResponse.json(
      { error: `No products with ASINs found for client ${clientIdCode}` },
      { status: 400 }
    );
  }

  // Create SP-API client
  const client = new SPAPIClient({
    clientId: process.env.SP_API_CLIENT_ID!,
    clientSecret: process.env.SP_API_CLIENT_SECRET!,
    refreshToken: creds.refreshToken,
    marketplaceId: creds.marketplaceId,
    sellerId: creds.sellerId,
    region: creds.region as "na" | "eu" | "fe",
  });

  // Batch fetch
  const asins = productList.map((p) => p.asin!);
  const catalogItems = await client.getCatalogItemsBatch(asins);

  // Process results
  const errors: string[] = [];
  let compared = 0;
  let failed = 0;
  const matchScores: number[] = [];

  // Build ASIN → product map
  const asinToProduct = new Map(productList.map((p) => [p.asin!, p]));

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
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${asin}: ${msg}`);
      failed++;
    }
  }

  // Count ASINs that weren't fetched at all
  for (const asin of asins) {
    if (!catalogItems.has(asin)) {
      errors.push(`${asin}: SP-API fetch failed`);
      failed++;
    }
  }

  // Update last_sync_at
  await db
    .update(spApiCredentials)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(spApiCredentials.id, creds.id));

  // Compute distribution
  const distribution = { perfect: 0, good: 0, drifted: 0, major: 0 };
  for (const score of matchScores) {
    if (score >= 95) distribution.perfect++;
    else if (score >= 70) distribution.good++;
    else if (score >= 50) distribution.drifted++;
    else distribution.major++;
  }

  const averageMatch =
    matchScores.length > 0
      ? Math.round(
          matchScores.reduce((a, b) => a + b, 0) / matchScores.length
        )
      : 0;

  return NextResponse.json({
    total: productList.length,
    compared,
    failed,
    averageMatch,
    distribution,
    errors: errors.slice(0, 50), // Cap error list
  });
}
