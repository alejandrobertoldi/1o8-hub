/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, varietyPackItems } from "@/lib/db/schema";
import { eq, and, or, ne, sql } from "drizzle-orm";

const FAMILY_SELECT = {
  id: master.id,
  asin: master.asin,
  sku: master.sku,
  parentSku: master.parentSku,
  parentAsin: master.parentAsin,
  parentageLevel: master.parentageLevel,
  clientIdCode: master.clientIdCode,
  marketplace: master.marketplace,
  status: master.status,
  brandName: master.brandName,
  itemName: master.itemName,
  summarizedTitle: master.summarizedTitle,
  listPrice: master.listPrice,
  mainImageUrl: master.mainImageUrl,
  isDirty: master.isDirty,
  variations: master.variations,
  variationGroup: master.variationGroup,
  variationRef: master.variationRef,
  varietyPackItemCount: sql<number>`(SELECT count(*)::int FROM ${varietyPackItems} WHERE ${varietyPackItems.packProductId} = "master"."id")`,
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch the current product
  const [current] = await db
    .select(FAMILY_SELECT)
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (!current) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const level = current.parentageLevel?.toLowerCase();

  // If no parentage info, return just the product
  if (!level || (level !== "parent" && level !== "child")) {
    return NextResponse.json({
      parent: null,
      children: [],
      currentId: id,
      variationTheme: current.variations?.["VariationThemeName"] ?? null,
    });
  }

  let parent = null;
  let children: (typeof current)[] = [];

  if (level === "parent") {
    parent = current;

    // Find children by parent_sku (Amazon hierarchy)
    const skuChildren = current.sku
      ? await db
          .select(FAMILY_SELECT)
          .from(master)
          .where(
            and(
              eq(master.parentSku, current.sku),
              or(
                eq(master.parentageLevel, "Child"),
                eq(master.parentageLevel, "child")
              ),
              sql`(${master.variations}->>'VariationID' IS NOT NULL AND ${master.variations}->>'VariationID' != '')`
            )
          )
      : [];

    // Also find products linked via variation builder (same variationRef, different product)
    const variationSiblings = current.variationRef
      ? await db
          .select(FAMILY_SELECT)
          .from(master)
          .where(
            and(
              eq(master.variationRef, current.variationRef),
              ne(master.id, current.id)
            )
          )
      : [];

    // Merge and deduplicate by ASIN (prefer copy with VP items, then by id)
    const byAsin = new Map<string, typeof current>();
    for (const c of [...skuChildren, ...variationSiblings]) {
      const key = c.asin || c.id; // fallback to id if no ASIN
      const existing = byAsin.get(key);
      if (!existing || (c.varietyPackItemCount ?? 0) > (existing.varietyPackItemCount ?? 0)) {
        byAsin.set(key, c);
      }
    }
    children = [...byAsin.values()];
  } else if (level === "child" && current.parentSku) {
    // Current product is a child — find parent by SKU, then find siblings
    const [parentProduct] = await db
      .select(FAMILY_SELECT)
      .from(master)
      .where(
        and(
          eq(master.sku, current.parentSku),
          eq(master.parentageLevel, "Parent")
        )
      )
      .limit(1);

    parent = parentProduct ?? null;

    // Find all children (siblings) with same parent_sku
    // Exclude orphaned children (variation ID removed)
    // Deduplicate by ASIN (prefer copy with VP items)
    const rawChildren = await db
      .select(FAMILY_SELECT)
      .from(master)
      .where(
        and(
          eq(master.parentSku, current.parentSku),
          or(
            eq(master.parentageLevel, "Child"),
            eq(master.parentageLevel, "child")
          ),
          sql`(${master.variations}->>'VariationID' IS NOT NULL AND ${master.variations}->>'VariationID' != '')`
        )
      );
    const byAsinChild = new Map<string, typeof current>();
    for (const c of rawChildren) {
      const key = c.asin || c.id;
      const existing = byAsinChild.get(key);
      if (!existing || (c.varietyPackItemCount ?? 0) > (existing.varietyPackItemCount ?? 0)) {
        byAsinChild.set(key, c);
      }
    }
    children = [...byAsinChild.values()];
  }

  // Fetch VP included flavors for children that are variety packs
  const vpChildren = children.filter((c) => (c.varietyPackItemCount ?? 0) > 0);
  const vpFlavorsMap: Record<string, string[]> = {};
  if (vpChildren.length > 0) {
    for (const vp of vpChildren) {
      const items = await db
        .select({ flavor: varietyPackItems.flavor, units: varietyPackItems.units })
        .from(varietyPackItems)
        .where(eq(varietyPackItems.packProductId, vp.id));
      vpFlavorsMap[vp.id] = items
        .filter((it) => it.flavor)
        .map((it) => (it.units > 1 ? `${it.units}× ${it.flavor}` : it.flavor!));
    }
  }

  // Attach vpFlavors to children
  const enrichedChildren = children.map((c) => ({
    ...c,
    vpFlavors: vpFlavorsMap[c.id] ?? null,
  }));

  return NextResponse.json({
    parent,
    children: enrichedChildren,
    currentId: id,
    variationTheme: parent?.variations?.["VariationThemeName"] ??
      current.variations?.["VariationThemeName"] ?? null,
  });
}
