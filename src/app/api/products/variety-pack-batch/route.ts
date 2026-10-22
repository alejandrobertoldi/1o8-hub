import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, varietyPackItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

// POST /api/products/variety-pack-batch — get variety pack items for multiple ASINs
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { asins } = (await req.json()) as { asins: string[] };
  if (!Array.isArray(asins) || asins.length === 0)
    return NextResponse.json({});

  // Find product IDs for these ASINs
  const products = await db
    .select({ id: master.id, asin: master.asin })
    .from(master)
    .where(inArray(master.asin, asins));

  if (products.length === 0) return NextResponse.json({});

  const productIds = products.map((p) => p.id);
  const asinById = new Map(products.map((p) => [p.id, p.asin]));

  // Fetch all variety pack items for these products
  const items = await db
    .select({
      id: varietyPackItems.id,
      packProductId: varietyPackItems.packProductId,
      includedProductId: varietyPackItems.includedProductId,
      flavor: varietyPackItems.flavor,
      size: varietyPackItems.size,
      color: varietyPackItems.color,
      style: varietyPackItems.style,
      customLabel: varietyPackItems.customLabel,
      units: varietyPackItems.units,
      sortOrder: varietyPackItems.sortOrder,
      // Joined included product info
      includedAsin: master.asin,
      includedTitle: master.itemName,
    })
    .from(varietyPackItems)
    .leftJoin(master, eq(varietyPackItems.includedProductId, master.id))
    .where(inArray(varietyPackItems.packProductId, productIds))
    .orderBy(varietyPackItems.sortOrder);

  // Group by ASIN
  const result: Record<string, typeof items> = {};
  for (const item of items) {
    const asin = asinById.get(item.packProductId);
    if (asin) {
      if (!result[asin]) result[asin] = [];
      result[asin].push(item);
    }
  }

  return NextResponse.json(result);
}
