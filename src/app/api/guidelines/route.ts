import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variations, variationGroups, variationGroupAssignments, master } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { ContentGuidelines } from "@/lib/variation-guidelines";

// GET /api/guidelines?clientId=AAC
// Returns the full 3-tier hierarchy: variations → groups → products (with content_guidelines at each)
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId)
    return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  // Load all variations for the client
  const variationRows = await db
    .select({
      id: variations.id,
      name: variations.name,
      contentGuidelines: variations.contentGuidelines,
    })
    .from(variations)
    .where(eq(variations.clientId, clientId))
    .orderBy(variations.name);

  if (!variationRows.length)
    return NextResponse.json({ variations: [] });

  const variationIds = variationRows.map((v) => v.id);

  // Load all groups for these variations
  const groupRows = await db
    .select({
      id: variationGroups.id,
      variationId: variationGroups.variationId,
      name: variationGroups.name,
      sortOrder: variationGroups.sortOrder,
      contentGuidelines: variationGroups.contentGuidelines,
    })
    .from(variationGroups)
    .where(inArray(variationGroups.variationId, variationIds))
    .orderBy(variationGroups.sortOrder);

  if (!groupRows.length)
    return NextResponse.json({
      variations: variationRows.map((v) => ({
        id: v.id,
        name: v.name,
        contentGuidelines: (v.contentGuidelines as ContentGuidelines) ?? null,
        groups: [],
      })),
    });

  const groupIds = groupRows.map((g) => g.id);

  // Load all product assignments for these groups
  const assignments = await db
    .select({
      groupId: variationGroupAssignments.groupId,
      productId: variationGroupAssignments.productId,
    })
    .from(variationGroupAssignments)
    .where(inArray(variationGroupAssignments.groupId, groupIds));

  const productIds = [...new Set(assignments.map((a) => a.productId))];

  // Load master product data for assigned products
  const products = productIds.length
    ? await db
        .select({
          id: master.id,
          asin: master.asin,
          itemName: master.itemName,
          contentGuidelines: master.contentGuidelines,
        })
        .from(master)
        .where(inArray(master.id, productIds))
    : [];

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Build groupId → productIds lookup
  const groupProductMap = new Map<string, string[]>();
  for (const a of assignments) {
    const list = groupProductMap.get(a.groupId) ?? [];
    list.push(a.productId);
    groupProductMap.set(a.groupId, list);
  }

  // Assemble response
  const result = variationRows.map((v) => ({
    id: v.id,
    name: v.name,
    contentGuidelines: (v.contentGuidelines as ContentGuidelines) ?? null,
    groups: groupRows
      .filter((g) => g.variationId === v.id)
      .map((g) => ({
        id: g.id,
        name: g.name,
        contentGuidelines: (g.contentGuidelines as ContentGuidelines) ?? null,
        products: (groupProductMap.get(g.id) ?? [])
          .map((pid) => productMap.get(pid))
          .filter(Boolean)
          .map((p) => ({
            id: p!.id,
            asin: p!.asin,
            itemName: p!.itemName,
            contentGuidelines: (p!.contentGuidelines as ContentGuidelines) ?? null,
          })),
      })),
  }));

  return NextResponse.json({ variations: result });
}
