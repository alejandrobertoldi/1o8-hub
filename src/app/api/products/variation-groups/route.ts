/* eslint-disable react-doctor/nextjs-no-redirect-in-try-catch */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { unauthorized, serverError } from "@/lib/api-utils";

/**
 * PATCH /api/products/variation-groups
 * Bulk assign variation_group to master rows.
 * Body: { product_ids: string[], variation_group: string | null }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session) return unauthorized();

    const body = await request.json();
    const { product_ids, variation_group } = body as {
      product_ids: string[];
      variation_group: string | null;
    };

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json({ error: "product_ids is required" }, { status: 400 });
    }

    const updated = await db
      .update(master)
      .set({ variationGroup: variation_group || null })
      .where(inArray(master.id, product_ids))
      .returning({ id: master.id });

    return NextResponse.json({ updated: updated.length });
  } catch (err: unknown) {
    console.error("Variation groups PATCH error:", err);
    return serverError(err);
  }
}
