/* eslint-disable react-doctor/async-defer-await */
/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, variations, variationGroups, variationTagAssignments, variationGroupAssignments } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/variations/[id]/assign — bulk assign products to variation/group + tags
// Body: { productIds: string[], groupId?: string | null, tagIds?: string[], unassign?: boolean }
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { productIds, groupId, tagIds, unassign } = body;

  if (!Array.isArray(productIds) || productIds.length === 0)
    return NextResponse.json(
      { error: "productIds array is required" },
      { status: 400 }
    );

  await db.transaction(async (tx) => {
    // Look up variation code + theme for syncing to product JSONB
    const [variation] = await tx
      .select({
        code: variations.code,
        themeAttributes: variations.themeAttributes,
        primaryDimension: variations.primaryDimension,
      })
      .from(variations)
      .where(eq(variations.id, id))
      .limit(1);
    const variationCode = variation?.code ?? null;
    // Reconstruct raw theme name from themeAttributes (e.g. ["Flavor","Size"] → "FLAVOR/SIZE")
    const themeAttrs = variation?.themeAttributes as string[] | null;
    const rawTheme = themeAttrs?.length ? themeAttrs.map((a) => a.toUpperCase()).join("/") : null;

    if (unassign) {
      // Clear variation_ref and VariationID from JSONB
      await tx
        .update(master)
        .set({
          variationRef: null,
          groupRef: null,
          variationGroup: null,
          variations: sql`COALESCE(${master.variations}::jsonb, '{}'::jsonb) - 'VariationID'`,
        })
        .where(inArray(master.id, productIds));

      // Remove all group assignments for these products
      for (const productId of productIds) {
        await tx
          .delete(variationGroupAssignments)
          .where(eq(variationGroupAssignments.productId, productId));
      }

      // Remove tag assignments
      for (const productId of productIds) {
        await tx
          .delete(variationTagAssignments)
          .where(eq(variationTagAssignments.productId, productId));
      }
      return;
    }

    // 1. Set variation_ref, VariationID, and VariationThemeName in JSONB
    await tx
      .update(master)
      .set({
        variationRef: id,
        variations: rawTheme
          ? sql`jsonb_set(
              jsonb_set(
                COALESCE(${master.variations}::jsonb, '{}'::jsonb),
                '{VariationID}',
                ${JSON.stringify(variationCode)}::jsonb
              ),
              '{VariationThemeName}',
              ${JSON.stringify(rawTheme)}::jsonb
            )`
          : sql`jsonb_set(
              COALESCE(${master.variations}::jsonb, '{}'::jsonb),
              '{VariationID}',
              ${JSON.stringify(variationCode)}::jsonb
            )`,
      })
      .where(inArray(master.id, productIds));

    // 2. Handle group assignment via junction table (additive — doesn't remove from other groups)
    if (groupId) {
      // Look up group name to sync variationGroup varchar
      const [group] = await tx
        .select({ name: variationGroups.name })
        .from(variationGroups)
        .where(eq(variationGroups.id, groupId))
        .limit(1);

      // Insert into junction table (additive)
      const groupInserts = productIds.map((productId: string) => ({
        groupId,
        productId,
      }));
      await tx
        .insert(variationGroupAssignments)
        .values(groupInserts)
        .onConflictDoNothing();

      // Sync variationGroup display field — comma-separated list of all group names
      if (group) {
        for (const productId of productIds) {
          const assignments = await tx
            .select({ name: variationGroups.name })
            .from(variationGroupAssignments)
            .innerJoin(variationGroups, eq(variationGroupAssignments.groupId, variationGroups.id))
            .where(eq(variationGroupAssignments.productId, productId));
          const names = assignments.map((a) => a.name).join(", ");
          await tx
            .update(master)
            .set({ variationGroup: names || null })
            .where(eq(master.id, productId));
        }
      }
    } else if (groupId === null) {
      // Explicit ungrouping: remove all group assignments for these products
      for (const productId of productIds) {
        await tx
          .delete(variationGroupAssignments)
          .where(eq(variationGroupAssignments.productId, productId));
      }
      await tx
        .update(master)
        .set({ groupRef: null, variationGroup: null })
        .where(inArray(master.id, productIds));
    }

    // 3. Handle tag assignments if provided
    if (Array.isArray(tagIds)) {
      for (const productId of productIds) {
        await tx
          .delete(variationTagAssignments)
          .where(eq(variationTagAssignments.productId, productId));
      }

      if (tagIds.length > 0) {
        const inserts = productIds.flatMap((productId: string) =>
          tagIds.map((tagId: string) => ({ tagId, productId }))
        );
        await tx
          .insert(variationTagAssignments)
          .values(inserts)
          .onConflictDoNothing();
      }
    }
  });

  return NextResponse.json({ ok: true, updated: productIds.length });
}
