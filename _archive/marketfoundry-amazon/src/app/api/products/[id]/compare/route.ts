/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, amazonSnapshots, spApiCredentials } from "@/lib/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import { SPAPIClient } from "@/lib/sp-api/client";
import { normalizeCatalogItem } from "@/lib/sp-api/normalizer";
import { compareProductWithAmazon } from "@/lib/sp-api/comparator";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot run comparisons" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const forceRefresh = body?.forceRefresh === true;

  // Fetch product
  const [product] = await db
    .select()
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.asin) {
    return NextResponse.json(
      { error: "Product has no ASIN" },
      { status: 400 }
    );
  }

  if (!product.clientIdCode) {
    return NextResponse.json(
      { error: "Product has no client ID code" },
      { status: 400 }
    );
  }

  // Fetch SP-API credentials for this client
  const [creds] = await db
    .select()
    .from(spApiCredentials)
    .where(
      and(
        eq(spApiCredentials.clientIdCode, product.clientIdCode),
        eq(spApiCredentials.isActive, true)
      )
    )
    .limit(1);

  if (!creds) {
    return NextResponse.json(
      {
        error: `No SP-API credentials configured for client ${product.clientIdCode}`,
      },
      { status: 400 }
    );
  }

  // Check for recent snapshot (within 24 hours)
  if (!forceRefresh) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentSnapshot] = await db
      .select()
      .from(amazonSnapshots)
      .where(
        and(
          eq(amazonSnapshots.productId, id),
          gte(amazonSnapshots.fetchedAt, twentyFourHoursAgo)
        )
      )
      .orderBy(desc(amazonSnapshots.fetchedAt))
      .limit(1);

    if (recentSnapshot) {
      // Re-run comparison against current Hub data (product may have changed)
      const normalizedData = recentSnapshot.normalizedData as ReturnType<
        typeof normalizeCatalogItem
      >;
      const comparison = compareProductWithAmazon(product, normalizedData);
      return NextResponse.json({ comparison, cached: true });
    }
  }

  // Fetch fresh data from SP-API
  const client = new SPAPIClient({
    clientId: process.env.SP_API_CLIENT_ID!,
    clientSecret: process.env.SP_API_CLIENT_SECRET!,
    refreshToken: creds.refreshToken,
    marketplaceId: creds.marketplaceId,
    sellerId: creds.sellerId,
    region: creds.region as "na" | "eu" | "fe",
  });

  let catalogItem;
  try {
    catalogItem = await client.getCatalogItem(product.asin);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("(404)")) {
      return NextResponse.json(
        { error: `Product not found on Amazon (ASIN: ${product.asin})` },
        { status: 404 }
      );
    }
    if (msg.includes("(403)")) {
      return NextResponse.json(
        { error: "SP-API access denied — check credentials" },
        { status: 403 }
      );
    }
    throw err;
  }

  // Optionally fetch listing item for keywords (SKU may not exist)
  let listingItem = null;
  if (product.sku) {
    try {
      listingItem = await client.getListingItem(product.sku);
    } catch {
      // SKU may not exist in SP-API — that's fine
    }
  }

  // Normalize and compare
  const normalizedData = normalizeCatalogItem(catalogItem, listingItem);
  const comparison = compareProductWithAmazon(product, normalizedData);

  // Store snapshot
  await db.insert(amazonSnapshots).values({
    productId: id,
    asin: product.asin,
    marketplace: product.marketplace,
    normalizedData,
    comparisonResult: comparison,
    overallMatch: comparison.overallMatch,
    fetchedAt: new Date(),
  });

  return NextResponse.json({ comparison, cached: false });
}
