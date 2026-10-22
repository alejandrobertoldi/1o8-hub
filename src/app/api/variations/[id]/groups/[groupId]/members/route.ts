/* eslint-disable react-doctor/server-sequential-independent-await */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variationGroupAssignments, variationGroups, master } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

type Params = { params: Promise<{ id: string; groupId: string }> };

// DELETE /api/variations/[id]/groups/[groupId]/members — remove products from a group
// Body: { productIds: string[] }
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { groupId } = await params;
  const body = await req.json();
  const { productIds } = body;

  if (!Array.isArray(productIds) || productIds.length === 0)
    return NextResponse.json({ error: "productIds array is required" }, { status: 400 });

  await db.transaction(async (tx) => {
    // Remove junction rows
    for (const productId of productIds) {
      await tx
        .delete(variationGroupAssignments)
        .where(
          and(
            eq(variationGroupAssignments.groupId, groupId),
            eq(variationGroupAssignments.productId, productId)
          )
        );
    }

    // Rebuild variationGroup display field for affected products
    for (const productId of productIds) {
      const remaining = await tx
        .select({ name: variationGroups.name })
        .from(variationGroupAssignments)
        .innerJoin(variationGroups, eq(variationGroupAssignments.groupId, variationGroups.id))
        .where(eq(variationGroupAssignments.productId, productId));
      const names = remaining.map((g) => g.name).join(", ");
      await tx
        .update(master)
        .set({ variationGroup: names || null })
        .where(eq(master.id, productId));
    }
  });

  return NextResponse.json({ ok: true, removed: productIds.length });
}
