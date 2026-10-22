import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// GET /api/products/[id]/siblings — all same-client child products (for variety pack builder)
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [product] = await db
    .select({ clientIdCode: master.clientIdCode })
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (!product?.clientIdCode) return NextResponse.json([]);

  // Return all same-client child products (excluding self and parents)
  // COALESCE across all JSONB blobs — mirrors getProductFieldValue lookup order
  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      mainImageUrl: master.mainImageUrl,
      flavor: sql<string | null>`COALESCE(${master.variations}->>'Flavor', ${master.contentSeo}->>'Flavor', ${master.packaging}->>'Flavor', ${master.targetAudience}->>'Flavor', ${master.fulfillment}->>'Flavor', ${master.productAttributes}->>'Flavor', ${master.nutritionSupplements}->>'Flavor', ${master.complianceSafety}->>'Flavor', ${master.images}->>'Flavor', ${master.dimensionsWeight}->>'Flavor', ${master.otherAttributes}->>'Flavor', ${master.rawColumnValues}->>'Flavor')`,
      size: sql<string | null>`COALESCE(${master.variations}->>'Size', ${master.contentSeo}->>'Size', ${master.packaging}->>'Size', ${master.targetAudience}->>'Size', ${master.fulfillment}->>'Size', ${master.productAttributes}->>'Size', ${master.nutritionSupplements}->>'Size', ${master.complianceSafety}->>'Size', ${master.images}->>'Size', ${master.dimensionsWeight}->>'Size', ${master.otherAttributes}->>'Size', ${master.rawColumnValues}->>'Size')`,
      color: sql<string | null>`COALESCE(${master.variations}->>'Color', ${master.contentSeo}->>'Color', ${master.packaging}->>'Color', ${master.targetAudience}->>'Color', ${master.fulfillment}->>'Color', ${master.productAttributes}->>'Color', ${master.nutritionSupplements}->>'Color', ${master.complianceSafety}->>'Color', ${master.images}->>'Color', ${master.dimensionsWeight}->>'Color', ${master.otherAttributes}->>'Color', ${master.rawColumnValues}->>'Color')`,
      style: sql<string | null>`COALESCE(${master.variations}->>'Style', ${master.contentSeo}->>'Style', ${master.packaging}->>'Style', ${master.targetAudience}->>'Style', ${master.fulfillment}->>'Style', ${master.productAttributes}->>'Style', ${master.nutritionSupplements}->>'Style', ${master.complianceSafety}->>'Style', ${master.images}->>'Style', ${master.dimensionsWeight}->>'Style', ${master.otherAttributes}->>'Style', ${master.rawColumnValues}->>'Style')`,
    })
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, product.clientIdCode),
        ne(master.id, id),
        ne(master.parentageLevel, "Parent")
      )
    )
    .orderBy(master.asin)
    .limit(200);

  return NextResponse.json(rows);
}
