/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, varietyPackItems } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) return NextResponse.json({ error: "clientIdCode required" }, { status: 400 });

  const products = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      title: master.itemName,
      price: master.listPrice,
      variations: master.variations,
      variationGroup: master.variationGroup,
      parentageLevel: master.parentageLevel,
      varietyPackItemCount: sql<number>`(SELECT count(*)::int FROM ${varietyPackItems} WHERE ${varietyPackItems.packProductId} = "master"."id")`,
    })
    .from(master)
    .where(eq(master.clientIdCode, clientIdCode));

  // Enrich VP products with breakdown flavors
  const vpProducts = products.filter((p) => (p.varietyPackItemCount ?? 0) > 0);
  const vpFlavorsMap: Record<string, string[]> = {};
  if (vpProducts.length > 0) {
    for (const vp of vpProducts) {
      const items = await db
        .select({ flavor: varietyPackItems.flavor, units: varietyPackItems.units })
        .from(varietyPackItems)
        .where(eq(varietyPackItems.packProductId, vp.id));
      vpFlavorsMap[vp.id] = items
        .filter((it) => it.flavor)
        .map((it) => (it.units > 1 ? `${it.units}× ${it.flavor}` : it.flavor!));
    }
  }

  const enriched = products.map((p) => ({
    ...p,
    vpFlavors: vpFlavorsMap[p.id] ?? null,
  }));

  return NextResponse.json(enriched);
}
