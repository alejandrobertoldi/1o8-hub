/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import {
  seoProjects,
  seoAsins,
  master,
  variations,
  variationGroups,
  variationGroupAssignments,
} from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/seo/projects/[id]/export-variation
 *
 * Reads SEO project ASIN/family data and auto-creates a variation
 * with groups and product assignments in the variation builder.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // 1. Load the SEO project
  const [project] = await db
    .select()
    .from(seoProjects)
    .where(eq(seoProjects.id, id))
    .limit(1);

  if (!project)
    return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (project.variationId)
    return NextResponse.json(
      { error: "Project already linked to a variation", variationId: project.variationId },
      { status: 409 }
    );

  if (!project.clientIdCode)
    return NextResponse.json(
      { error: "Project has no client ID code" },
      { status: 400 }
    );

  // 2. Load seoAsins for this project
  const asins = await db
    .select()
    .from(seoAsins)
    .where(eq(seoAsins.projectId, id));

  if (asins.length === 0)
    return NextResponse.json(
      { error: "No ASINs found in this project" },
      { status: 400 }
    );

  // 3. Match seoAsins to master products by ASIN + clientIdCode
  const asinValues = [...new Set(asins.map((a) => a.asin).filter(Boolean))];
  const products = await db
    .select({ id: master.id, asin: master.asin, parentageLevel: master.parentageLevel })
    .from(master)
    .where(
      sql`${master.asin} = ANY(${asinValues}) AND ${master.clientIdCode} = ${project.clientIdCode}`
    );

  const productByAsin = new Map(products.map((p) => [p.asin, p]));

  // 4. Build variation families from seoAsins (same logic as intake buildVariationFamilies)
  const parents = asins.filter((a) => a.parentageLevel === "Parent");
  const children = asins.filter((a) => a.parentageLevel === "Child");

  // Detect variation theme from parents
  const themes = [
    ...new Set(parents.map((p) => p.variationThemeName).filter(Boolean)),
  ];
  const primaryTheme = themes[0] || null;

  // Detect theme attributes from the data
  const themeAttrs: string[] = [];
  const hasAttr = (field: string) =>
    asins.some((a) => a[field as keyof typeof a]);
  if (hasAttr("flavor")) themeAttrs.push("Flavor");
  if (hasAttr("color")) themeAttrs.push("Color");
  if (hasAttr("size")) themeAttrs.push("Size");
  if (hasAttr("style")) themeAttrs.push("Style");

  // Build group names from variationGroup field on seoAsins
  const groupNames = [
    ...new Set(
      asins
        .map((a) => a.variationGroup)
        .filter((g): g is string => !!g && g.trim().length > 0)
    ),
  ];

  // If no explicit groups, create one group per parent
  const useParentGroups = groupNames.length === 0 && parents.length > 0;

  // Generate a unique variation code
  const codeBase = `${project.clientIdCode}-SEO-${project.name
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 10)
    .toUpperCase()}`;

  // 5. Create everything in a transaction
  const result = await db.transaction(async (tx) => {
    // Create the variation
    const [variation] = await tx
      .insert(variations)
      .values({
        clientId: project.clientIdCode!,
        name: project.name,
        code: codeBase,
        amazonVariationId: parents[0]?.variationId || null,
        themeAttributes: themeAttrs,
        primaryDimension: primaryTheme,
        description: `Auto-created from SEO project "${project.name}"`,
      })
      .returning();

    // Create groups
    const groupMap = new Map<string, string>(); // groupName -> groupId

    if (useParentGroups) {
      // One group per parent ASIN
      for (let i = 0; i < parents.length; i++) {
        const parent = parents[i];
        const groupName =
          parent.variationProduct || parent.asin || `Group ${i + 1}`;
        const [group] = await tx
          .insert(variationGroups)
          .values({
            variationId: variation.id,
            name: groupName,
            dimension: primaryTheme || "Variation",
            sortOrder: i,
          })
          .returning();
        groupMap.set(parent.asin, group.id);
      }
    } else if (groupNames.length > 0) {
      // Named groups from variationGroup field
      for (let i = 0; i < groupNames.length; i++) {
        const [group] = await tx
          .insert(variationGroups)
          .values({
            variationId: variation.id,
            name: groupNames[i],
            dimension: primaryTheme || "Variation",
            sortOrder: i,
          })
          .returning();
        groupMap.set(groupNames[i], group.id);
      }
    }

    // Assign products to variation + groups
    const assignedProductIds: string[] = [];

    for (const seoAsin of asins) {
      const product = productByAsin.get(seoAsin.asin);
      if (!product) continue;

      assignedProductIds.push(product.id);

      // Determine which group this product belongs to
      let groupId: string | null = null;
      if (useParentGroups) {
        // Children go into their parent's group, parents into their own
        if (seoAsin.parentageLevel === "Parent") {
          groupId = groupMap.get(seoAsin.asin) || null;
        } else {
          // Find parent for this child by matching variationId or variationGroup
          const parentAsin = parents.find(
            (p) =>
              (seoAsin.variationId && p.variationId === seoAsin.variationId) ||
              (seoAsin.variationGroup && p.asin === seoAsin.variationGroup)
          );
          if (parentAsin) groupId = groupMap.get(parentAsin.asin) || null;
          // Fallback: first parent group
          if (!groupId && parents.length === 1)
            groupId = groupMap.get(parents[0].asin) || null;
        }
      } else if (seoAsin.variationGroup && groupMap.has(seoAsin.variationGroup)) {
        groupId = groupMap.get(seoAsin.variationGroup) || null;
      }

      // Insert group assignment if we have a group
      if (groupId) {
        await tx
          .insert(variationGroupAssignments)
          .values({ groupId, productId: product.id })
          .onConflictDoNothing();
      }
    }

    // Bulk update master: set variationRef + VariationID in JSONB
    if (assignedProductIds.length > 0) {
      await tx
        .update(master)
        .set({
          variationRef: variation.id,
          variations: sql`jsonb_set(
            COALESCE(${master.variations}::jsonb, '{}'::jsonb),
            '{VariationID}',
            ${JSON.stringify(variation.code)}::jsonb
          )`,
        })
        .where(inArray(master.id, assignedProductIds));

      // Sync variationGroup display field for products with group assignments
      for (const productId of assignedProductIds) {
        const assignments = await tx
          .select({ name: variationGroups.name })
          .from(variationGroupAssignments)
          .innerJoin(
            variationGroups,
            eq(variationGroupAssignments.groupId, variationGroups.id)
          )
          .where(eq(variationGroupAssignments.productId, productId));
        if (assignments.length > 0) {
          const names = assignments.map((a) => a.name).join(", ");
          await tx
            .update(master)
            .set({ variationGroup: names })
            .where(eq(master.id, productId));
        }
      }
    }

    // Link the SEO project back to the variation
    await tx
      .update(seoProjects)
      .set({ variationId: variation.id, updatedAt: new Date() })
      .where(eq(seoProjects.id, id));

    return {
      variationId: variation.id,
      variationName: variation.name,
      variationCode: variation.code,
      groupsCreated: groupMap.size,
      productsAssigned: assignedProductIds.length,
      totalAsins: asins.length,
      unmatchedAsins: asins.length - assignedProductIds.length,
    };
  });

  return NextResponse.json(result, { status: 201 });
}
