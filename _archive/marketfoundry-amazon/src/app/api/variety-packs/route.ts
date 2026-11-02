/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, varietyPackItems, aac } from "@/lib/db/schema";
import { eq, sql, inArray, ilike } from "drizzle-orm";

// GET /api/variety-packs — every IsVP listing, including those with no items yet
// Optional: ?client=CLIENTCODE to filter by client
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientFilter = req.nextUrl.searchParams.get("client");

  let activeCodes = new Set<string>();
  if (!clientFilter) {
    const activeClientRows = await db
      .select({ code: aac.clientIdCode })
      .from(aac)
      .where(ilike(aac.clientStatus, "active"));
    activeCodes = new Set(activeClientRows.map((r) => r.code.toLowerCase()));
  }

  const [packProducts, isVpRows] = await Promise.all([
    db
      .select({
        packProductId: varietyPackItems.packProductId,
        itemCount: sql<number>`coalesce(sum(${varietyPackItems.units}), 0)::int`,
      })
      .from(varietyPackItems)
      .groupBy(varietyPackItems.packProductId),
    db.select({ id: master.id }).from(master).where(eq(master.isVp, true)),
  ]);

  const countMap = new Map<string, number>();
  for (const p of packProducts) countMap.set(p.packProductId, p.itemCount);
  for (const row of isVpRows) {
    if (!countMap.has(row.id)) countMap.set(row.id, 0);
  }

  const productIds = [...countMap.keys()];
  if (productIds.length === 0) return NextResponse.json([]);

  const [products, items] = await Promise.all([
    db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        clientIdCode: master.clientIdCode,
        itemName: master.itemName,
        summarizedTitle: master.summarizedTitle,
        mainImageUrl: master.mainImageUrl,
      })
      .from(master)
      .where(inArray(master.id, productIds)),
    db
      .select({
        packProductId: varietyPackItems.packProductId,
        flavor: varietyPackItems.flavor,
        size: varietyPackItems.size,
        color: varietyPackItems.color,
        style: varietyPackItems.style,
        customLabel: varietyPackItems.customLabel,
        units: varietyPackItems.units,
        includedAsin: master.asin,
        includedSku: master.sku,
        includedTitle: master.itemName,
      })
      .from(varietyPackItems)
      .leftJoin(master, eq(varietyPackItems.includedProductId, master.id))
      .where(inArray(varietyPackItems.packProductId, productIds))
      .orderBy(varietyPackItems.sortOrder),
  ]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const itemsByProduct = new Map<string, typeof items>();
  for (const item of items) {
    if (!itemsByProduct.has(item.packProductId)) itemsByProduct.set(item.packProductId, []);
    itemsByProduct.get(item.packProductId)!.push(item);
  }

  const result = productIds
    .map((packProductId) => {
      const product = productMap.get(packProductId);
      if (!product) return null;
      if (clientFilter && product.clientIdCode?.toLowerCase() !== clientFilter.toLowerCase()) return null;
      if (!clientFilter && (!product.clientIdCode || !activeCodes.has(product.clientIdCode.toLowerCase()))) return null;
      const itemCount = countMap.get(packProductId) || 0;
      return {
        ...product,
        itemCount,
        items: (itemsByProduct.get(packProductId) || []).map((it) => ({
          flavor: it.flavor,
          size: it.size,
          color: it.color,
          style: it.style,
          customLabel: it.customLabel,
          units: it.units,
          includedAsin: it.includedAsin,
          includedSku: it.includedSku,
          includedTitle: it.includedTitle,
        })),
      };
    })
    .filter(Boolean)
    .toSorted((a, b) => {
      if (!a || !b) return 0;
      if (a.itemCount === 0 && b.itemCount !== 0) return -1;
      if (b.itemCount === 0 && a.itemCount !== 0) return 1;
      return b.itemCount - a.itemCount;
    });

  return NextResponse.json(result);
}
