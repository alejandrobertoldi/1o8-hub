/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSyncSnapshots, master } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { SYNC_FIELDS } from "@/lib/amazon-sync-field-map";
import { getProductFieldValue } from "@/lib/product-mapper";
import type { RainforestProduct } from "@/types/rainforest";
import type { Product } from "@/lib/db/schema";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const productId = req.nextUrl.searchParams.get("product_id");
  if (!productId) {
    return NextResponse.json({ error: "product_id required" }, { status: 400 });
  }

  // Get the product for catalog values
  const [product] = await db
    .select()
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Get latest snapshot per provider
  const [rainforestSnap] = await db
    .select()
    .from(amazonSyncSnapshots)
    .where(
      and(
        eq(amazonSyncSnapshots.productId, productId),
        eq(amazonSyncSnapshots.provider, "rainforest")
      )
    )
    .orderBy(desc(amazonSyncSnapshots.fetchedAt))
    .limit(1);

  const [firecrawlSnap] = await db
    .select()
    .from(amazonSyncSnapshots)
    .where(
      and(
        eq(amazonSyncSnapshots.productId, productId),
        eq(amazonSyncSnapshots.provider, "firecrawl")
      )
    )
    .orderBy(desc(amazonSyncSnapshots.fetchedAt))
    .limit(1);

  // Build three-way comparison for each field
  const rainforestData = rainforestSnap?.snapshotData as RainforestProduct | null;
  const firecrawlData = firecrawlSnap?.snapshotData as RainforestProduct | null;

  const fields = SYNC_FIELDS.map((field) => {
    const hubValue = field.getCatalogValue(product as Product);
    const rainforestValue = rainforestData
      ? field.getRainforestValue(rainforestData)
      : null;
    const firecrawlValue = firecrawlData
      ? field.getRainforestValue(firecrawlData)
      : null;

    // Determine if values match
    const allSame =
      hubValue === rainforestValue && rainforestValue === firecrawlValue;
    const rfMatch = rainforestValue === firecrawlValue;

    return {
      fieldName: field.field_name,
      label: field.label,
      fieldGroup: field.field_group,
      hubValue,
      rainforestValue,
      firecrawlValue,
      allMatch: allSame,
      providersMatch: rfMatch,
    };
  });

  return NextResponse.json({
    fields,
    rainforestSnapshot: rainforestSnap
      ? { id: rainforestSnap.id, fetchedAt: rainforestSnap.fetchedAt }
      : null,
    firecrawlSnapshot: firecrawlSnap
      ? { id: firecrawlSnap.id, fetchedAt: firecrawlSnap.fetchedAt }
      : null,
  });
}
