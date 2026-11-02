/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variationGroups, variationGroupAssignments, master } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string; groupId: string }> };

// PATCH /api/variations/[id]/groups/[groupId] — rename or reorder a group
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.dimension !== undefined) updates.dimension = body.dimension;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
  if (body.isVarietyPack !== undefined) updates.isVarietyPack = body.isVarietyPack;
  if (body.varietyPackDetails !== undefined) updates.varietyPackDetails = body.varietyPackDetails;
  if (body.contentGuidelines !== undefined)
    updates.contentGuidelines = body.contentGuidelines;

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const [row] = await db
    .update(variationGroups)
    .set(updates)
    .where(eq(variationGroups.id, groupId))
    .returning();

  if (!row)
    return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Sync variationGroup varchar on master rows when group is renamed
  if (body.name !== undefined) {
    // Find all products in this group via junction and rebuild their group name list
    const members = await db
      .select({ productId: variationGroupAssignments.productId })
      .from(variationGroupAssignments)
      .where(eq(variationGroupAssignments.groupId, groupId));

    for (const m of members) {
      const allGroups = await db
        .select({ name: variationGroups.name })
        .from(variationGroupAssignments)
        .innerJoin(variationGroups, eq(variationGroupAssignments.groupId, variationGroups.id))
        .where(eq(variationGroupAssignments.productId, m.productId));
      const names = allGroups.map((g) => g.name).join(", ");
      await db
        .update(master)
        .set({ variationGroup: names || null })
        .where(eq(master.id, m.productId));
    }
  }

  return NextResponse.json(row);
}

// DELETE /api/variations/[id]/groups/[groupId] — delete group, update variationGroup on members
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;

  await db.transaction(async (tx) => {
    // Find all products in this group before deletion
    const members = await tx
      .select({ productId: variationGroupAssignments.productId })
      .from(variationGroupAssignments)
      .where(eq(variationGroupAssignments.groupId, groupId));

    // Delete the group (cascades junction rows via FK)
    await tx.delete(variationGroups).where(eq(variationGroups.id, groupId));

    // Rebuild variationGroup display field for affected products
    for (const m of members) {
      const remaining = await tx
        .select({ name: variationGroups.name })
        .from(variationGroupAssignments)
        .innerJoin(variationGroups, eq(variationGroupAssignments.groupId, variationGroups.id))
        .where(eq(variationGroupAssignments.productId, m.productId));
      const names = remaining.map((g) => g.name).join(", ");
      await tx
        .update(master)
        .set({ variationGroup: names || null, groupRef: null })
        .where(eq(master.id, m.productId));
    }
  });

  return NextResponse.json({ ok: true });
}
