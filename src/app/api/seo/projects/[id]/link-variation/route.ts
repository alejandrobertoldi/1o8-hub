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
import { eq, and, inArray, sql } from "drizzle-orm";
import { invalidateSeoProjectsCache } from "@/lib/seo-projects-cache";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/seo/projects/[id]/link-variation
 *
 * Retroactively links an existing SEO project to its matching variation
 * by matching seoAsins → master products → variationRef.
 * Preserves all existing content (generatedContent, keywords, etc.).
 * Also syncs seo_asins.variationGroup from the variation builder's groups.
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

  // 3. Match seoAsins → master products (by asin + clientIdCode)
  const asinValues = [...new Set(asins.map((a) => a.asin).filter(Boolean))];

  if (asinValues.length === 0)
    return NextResponse.json(
      { error: "No valid ASINs in this project" },
      { status: 400 }
    );

  const matchedProducts = await db
    .select({
      id: master.id,
      asin: master.asin,
      variationRef: master.variationRef,
    })
    .from(master)
    .where(
      project.clientIdCode
        ? sql`${master.asin} = ANY(${asinValues}) AND ${master.clientIdCode} = ${project.clientIdCode}`
        : sql`${master.asin} = ANY(${asinValues})`
    );

  if (matchedProducts.length === 0)
    return NextResponse.json(
      { error: "No matching products found in catalog" },
      { status: 400 }
    );

  // 4. Find the variation these products belong to
  const variationRefs = [
    ...new Set(
      matchedProducts
        .map((p) => p.variationRef)
        .filter((ref): ref is string => !!ref)
    ),
  ];

  if (variationRefs.length === 0)
    return NextResponse.json(
      { error: "No products are assigned to a variation in the builder" },
      { status: 400 }
    );

  // Use the first (and expected only) variation
  const variationId = variationRefs[0];

  // Load variation details
  const [variation] = await db
    .select({ id: variations.id, name: variations.name, code: variations.code })
    .from(variations)
    .where(eq(variations.id, variationId))
    .limit(1);

  if (!variation)
    return NextResponse.json(
      { error: "Matched variation not found" },
      { status: 400 }
    );

  // 5. Collect unmatched ASINs (products not in catalog or not in a variation)
  const matchedAsinSet = new Set(matchedProducts.map((p) => p.asin));
  const unmatchedAsins = asinValues.filter((a) => !matchedAsinSet.has(a));
  const unassignedAsins = matchedProducts
    .filter((p) => !p.variationRef)
    .map((p) => p.asin);

  // 6. Transaction: link project + sync groups
  const result = await db.transaction(async (tx) => {
    // Count existing projects on this variation for version numbering
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(seoProjects)
      .where(eq(seoProjects.variationId, variationId));

    const version = count + 1;

    // Set variationId and version on the SEO project
    await tx
      .update(seoProjects)
      .set({
        variationId: variationId,
        version: version,
        updatedAt: new Date(),
      })
      .where(eq(seoProjects.id, id));

    // Sync seo_asins.variationGroup from variation_group_assignments
    // Build a map: productId -> group names
    const productIds = matchedProducts
      .filter((p) => p.variationRef === variationId)
      .map((p) => p.id);

    let groupsSynced = 0;

    if (productIds.length > 0) {
      // Get all group assignments for these products
      const assignments = await tx
        .select({
          productId: variationGroupAssignments.productId,
          groupName: variationGroups.name,
        })
        .from(variationGroupAssignments)
        .innerJoin(
          variationGroups,
          eq(variationGroupAssignments.groupId, variationGroups.id)
        )
        .where(inArray(variationGroupAssignments.productId, productIds));

      // Group by productId
      const groupsByProduct = new Map<string, string[]>();
      for (const a of assignments) {
        const existing = groupsByProduct.get(a.productId) || [];
        existing.push(a.groupName);
        groupsByProduct.set(a.productId, existing);
      }

      // Build asin → productId map
      const asinToProductId = new Map(
        matchedProducts.map((p) => [p.asin, p.id])
      );

      // Update seo_asins.variationGroup for matched ASINs
      for (const seoAsin of asins) {
        const productId = asinToProductId.get(seoAsin.asin);
        if (!productId) continue;

        const groups = groupsByProduct.get(productId);
        if (groups && groups.length > 0) {
          await tx
            .update(seoAsins)
            .set({ variationGroup: groups.join(", ") })
            .where(
              and(
                eq(seoAsins.projectId, id),
                eq(seoAsins.asin, seoAsin.asin)
              )
            );
          groupsSynced++;
        }
      }
    }

    return {
      variationId: variation.id,
      variationCode: variation.code,
      variationName: variation.name,
      version,
      matchedProducts: matchedProducts.length,
      totalAsins: asinValues.length,
      unmatchedAsins,
      unassignedAsins,
      groupsSynced,
    };
  });

  invalidateSeoProjectsCache();
  return NextResponse.json(result);
}
