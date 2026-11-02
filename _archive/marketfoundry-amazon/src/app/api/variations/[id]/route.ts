/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  variations,
  variationGroups,
  variationTags,
  variationTagAssignments,
  variationGroupAssignments,
  varietyPackItems,
  master,
} from "@/lib/db/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// GET /api/variations/[id] — full tree: variation + groups + tags + products
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Run four queries in parallel
  const [variationRows, groupRows, tags, allProducts] = await Promise.all([
    // 1. Variation metadata
    db.select().from(variations).where(eq(variations.id, id)).limit(1),

    // 2. Groups
    db
      .select()
      .from(variationGroups)
      .where(eq(variationGroups.variationId, id))
      .orderBy(variationGroups.sortOrder),

    // 3. Tags with assignment count
    db
      .select({
        id: variationTags.id,
        variationId: variationTags.variationId,
        dimension: variationTags.dimension,
        value: variationTags.value,
        sortOrder: variationTags.sortOrder,
        createdAt: variationTags.createdAt,
        assignmentCount: sql<number>`(
          SELECT COUNT(*)::int FROM variation_tag_assignments
          WHERE tag_id = ${variationTags.id}
        )`,
      })
      .from(variationTags)
      .where(eq(variationTags.variationId, id))
      .orderBy(variationTags.dimension, variationTags.sortOrder),

    // 4. All products in this variation (with their tag assignments)
    db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        itemName: master.itemName,
        imageUrl: master.mainImageUrl,
        groupRef: master.groupRef,
        parentageLevel: master.parentageLevel,
        variations: sql<Record<string,string> | null>`
          COALESCE(${master.variations}, '{}'::jsonb) ||
          jsonb_strip_nulls(jsonb_build_object(
            'Flavor', COALESCE(${master.variations}->>'Flavor', ${master.contentSeo}->>'Flavor', ${master.packaging}->>'Flavor', ${master.targetAudience}->>'Flavor', ${master.fulfillment}->>'Flavor', ${master.productAttributes}->>'Flavor', ${master.nutritionSupplements}->>'Flavor', ${master.complianceSafety}->>'Flavor', ${master.images}->>'Flavor', ${master.dimensionsWeight}->>'Flavor', ${master.otherAttributes}->>'Flavor', ${master.rawColumnValues}->>'Flavor'),
            'Size',   COALESCE(${master.variations}->>'Size',   ${master.contentSeo}->>'Size',   ${master.packaging}->>'Size',   ${master.targetAudience}->>'Size',   ${master.fulfillment}->>'Size',   ${master.productAttributes}->>'Size',   ${master.nutritionSupplements}->>'Size',   ${master.complianceSafety}->>'Size',   ${master.images}->>'Size',   ${master.dimensionsWeight}->>'Size',   ${master.otherAttributes}->>'Size',   ${master.rawColumnValues}->>'Size'),
            'Color',  COALESCE(${master.variations}->>'Color',  ${master.contentSeo}->>'Color',  ${master.packaging}->>'Color',  ${master.targetAudience}->>'Color',  ${master.fulfillment}->>'Color',  ${master.productAttributes}->>'Color',  ${master.nutritionSupplements}->>'Color',  ${master.complianceSafety}->>'Color',  ${master.images}->>'Color',  ${master.dimensionsWeight}->>'Color',  ${master.otherAttributes}->>'Color',  ${master.rawColumnValues}->>'Color'),
            'Style',  COALESCE(${master.variations}->>'Style',  ${master.contentSeo}->>'Style',  ${master.packaging}->>'Style',  ${master.targetAudience}->>'Style',  ${master.fulfillment}->>'Style',  ${master.productAttributes}->>'Style',  ${master.nutritionSupplements}->>'Style',  ${master.complianceSafety}->>'Style',  ${master.images}->>'Style',  ${master.dimensionsWeight}->>'Style',  ${master.otherAttributes}->>'Style',  ${master.rawColumnValues}->>'Style')
          ))
        `,
      })
      .from(master)
      .where(eq(master.variationRef, id)),
  ]);

  if (variationRows.length === 0)
    return NextResponse.json({ error: "Variation not found" }, { status: 404 });

  // Get tag assignments and group assignments for all products in this variation
  const productIds = allProducts.map((p) => p.id);
  let tagAssignments: { tagId: string; productId: string }[] = [];
  let groupAssignments: { groupId: string; productId: string }[] = [];
  let packItems: { packProductId: string; includedProductId: string | null; flavor: string | null; size: string | null; color: string | null; style: string | null; customLabel: string | null; units: number; sortOrder: number | null; includedAsin: string | null; includedTitle: string | null }[] = [];
  if (productIds.length > 0) {
    [tagAssignments, groupAssignments, packItems] = await Promise.all([
      db
        .select({
          tagId: variationTagAssignments.tagId,
          productId: variationTagAssignments.productId,
        })
        .from(variationTagAssignments)
        .where(inArray(variationTagAssignments.productId, productIds)),
      db
        .select({
          groupId: variationGroupAssignments.groupId,
          productId: variationGroupAssignments.productId,
        })
        .from(variationGroupAssignments)
        .where(inArray(variationGroupAssignments.productId, productIds)),
      db
        .select({
          packProductId: varietyPackItems.packProductId,
          includedProductId: varietyPackItems.includedProductId,
          flavor: varietyPackItems.flavor,
          size: varietyPackItems.size,
          color: varietyPackItems.color,
          style: varietyPackItems.style,
          customLabel: varietyPackItems.customLabel,
          units: varietyPackItems.units,
          sortOrder: varietyPackItems.sortOrder,
          includedAsin: master.asin,
          includedTitle: master.itemName,
        })
        .from(varietyPackItems)
        .leftJoin(master, eq(varietyPackItems.includedProductId, master.id))
        .where(inArray(varietyPackItems.packProductId, productIds))
        .orderBy(varietyPackItems.sortOrder),
    ]);
  }

  // Build variety pack lookup (product → items)
  const packLookup = new Map<string, typeof packItems>();
  for (const item of packItems) {
    const arr = packLookup.get(item.packProductId) ?? [];
    arr.push(item);
    packLookup.set(item.packProductId, arr);
  }

  // Build group membership lookup (product → set of group IDs)
  const groupMembership = new Map<string, Set<string>>();
  for (const ga of groupAssignments) {
    const set = groupMembership.get(ga.productId) ?? new Set();
    set.add(ga.groupId);
    groupMembership.set(ga.productId, set);
  }

  // Build tag lookup per product
  const tagLookup = new Map<string, { id: string; dimension: string; value: string }[]>();
  for (const assignment of tagAssignments) {
    const tag = tags.find((t) => t.id === assignment.tagId);
    if (tag) {
      const arr = tagLookup.get(assignment.productId) ?? [];
      arr.push({ id: tag.id, dimension: tag.dimension, value: tag.value });
      tagLookup.set(assignment.productId, arr);
    }
  }

  // Map products with tags + variety pack items
  const mapProduct = (p: typeof allProducts[0]) => ({
    id: p.id,
    asin: p.asin,
    sku: p.sku,
    title: p.itemName,
    imageUrl: p.imageUrl,
    parentageLevel: p.parentageLevel,
    variations: p.variations,
    tags: tagLookup.get(p.id) ?? [],
    varietyPackItems: (packLookup.get(p.id) ?? []).map((it) => ({
      includedProductId: it.includedProductId,
      includedAsin: it.includedAsin,
      includedTitle: it.includedTitle,
      flavor: it.flavor,
      size: it.size,
      color: it.color,
      style: it.style,
      customLabel: it.customLabel,
      units: it.units,
    })),
  });

  // Build groups with products (via junction — a product can appear in multiple groups)
  // Also include VP products whose included flavors match the group name
  const groups = groupRows.map((g) => {
    const assigned = allProducts.filter((p) => groupMembership.get(p.id)?.has(g.id));
    const assignedIds = new Set(assigned.map((p) => p.id));
    const vpMatches = allProducts.filter((p) => {
      if (assignedIds.has(p.id)) return false;
      const items = packLookup.get(p.id);
      if (!items?.length) return false;
      const gLower = g.name.toLowerCase().replace(/[^a-z]/g, "");
      return items.some((it) => {
        if (!it.flavor) return false;
        const fLower = it.flavor.toLowerCase().replace(/[^a-z]/g, "");
        // Exact match, or group name is an abbreviation (first letters of each word)
        if (fLower === gLower) return true;
        const initials = it.flavor.split(/\s+/).map((w) => w.slice(0, 3).toLowerCase()).join("");
        return initials === gLower;
      });
    });
    return {
      ...g,
      products: [...assigned, ...vpMatches].map(mapProduct),
    };
  });

  // Ungrouped products — those with no group assignments at all
  const ungroupedProducts = allProducts
    .filter((p) => !groupMembership.has(p.id))
    .map(mapProduct);

  return NextResponse.json({
    ...variationRows[0],
    groups,
    tags,
    ungroupedProducts,
  });
}

// PATCH /api/variations/[id] — update variation metadata
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.code !== undefined) updates.code = body.code;
  if (body.amazonVariationId !== undefined)
    updates.amazonVariationId = body.amazonVariationId;
  if (body.themeAttributes !== undefined)
    updates.themeAttributes = body.themeAttributes;
  if (body.primaryDimension !== undefined)
    updates.primaryDimension = body.primaryDimension;
  if (body.description !== undefined) updates.description = body.description;
  if (body.contentGuidelines !== undefined)
    updates.contentGuidelines = body.contentGuidelines;
  if (body.status !== undefined) {
    updates.status = body.status;
    updates.lockedAt = body.status === "locked" ? new Date() : null;
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  updates.updatedAt = new Date();

  const [row] = await db
    .update(variations)
    .set(updates)
    .where(eq(variations.id, id))
    .returning();

  if (!row)
    return NextResponse.json({ error: "Variation not found" }, { status: 404 });

  // When theme changes, sync VariationThemeName on included products only
  // Included = linked via FK OR matching VariationID code in JSONB
  if (body.variationThemeRaw) {
    const variationCode = row.code;
    await db
      .update(master)
      .set({
        variations: sql`jsonb_set(
          COALESCE(${master.variations}::jsonb, '{}'::jsonb),
          '{VariationThemeName}',
          ${JSON.stringify(body.variationThemeRaw)}::jsonb
        )`,
      })
      .where(
        sql`${master.variationRef} = ${id} OR ${master.variations}->>'VariationID' = ${variationCode}`
      );
  }

  // Inheritance sync: when locking, propagate parent ASIN/SKU to children
  if (body.status === "locked") {
    // Get all products in this variation
    const allProducts = await db
      .select({
        id: master.id,
        asin: master.asin,
        sku: master.sku,
        parentageLevel: master.parentageLevel,
      })
      .from(master)
      .where(eq(master.variationRef, id));

    // Find parent products
    const parents = allProducts.filter((p) => p.parentageLevel === "Parent");
    if (parents.length > 0) {
      const parentAsin = parents[0].asin;
      const parentSku = parents[0].sku;

      // Update children: set parent_asin, parent_sku, and variationProduct
      const childIds = allProducts
        .filter((p) => p.parentageLevel !== "Parent")
        .map((p) => p.id);

      if (childIds.length > 0 && parentAsin && parentSku) {
        await db.execute(sql`
          UPDATE master
          SET parent_asin = ${parentAsin},
              parent_sku = ${parentSku},
              child_relationship_type = 'variation',
              variations = jsonb_set(
                COALESCE(variations::jsonb, '{}'::jsonb),
                '{VariationProduct}',
                ${JSON.stringify(row.name)}::jsonb
              )
          WHERE id IN (${sql.join(childIds.map(id => sql`${id}`), sql`, `)})
        `);
      }
    }
  }

  return NextResponse.json(row);
}

// DELETE /api/variations/[id] — delete variation (cascades groups/tags; unsets master FKs)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  await db.transaction(async (tx) => {
    // Unset variation_ref, group_ref, variationGroup, and VariationID on master rows
    await tx
      .update(master)
      .set({
        variationRef: null,
        groupRef: null,
        variationGroup: null,
        variations: sql`COALESCE(${master.variations}::jsonb, '{}'::jsonb) - 'VariationID'`,
      })
      .where(eq(master.variationRef, id));

    // Delete the variation (cascades groups, tags, tag/group assignments via FK cascade)
    await tx.delete(variations).where(eq(variations.id, id));
  });

  return NextResponse.json({ ok: true });
}
