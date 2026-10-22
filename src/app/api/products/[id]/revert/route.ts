/* eslint-disable react-doctor/js-combine-iterations */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, activityLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CORE_COLUMNS } from "@/lib/column-registry";

const JSONB_FIELDS = [
  "contentSeo", "variations", "packaging", "targetAudience",
  "fulfillment", "productAttributes", "nutritionSupplements",
  "complianceSafety", "images", "dimensionsWeight", "otherAttributes",
] as const;

const coreByBqName = new Map(
  CORE_COLUMNS.filter((c) => c.coreField).map((c) => [c.bqName, c.coreField!])
);

/**
 * POST /api/products/[id]/revert
 * Reverts all unpublished changes by walking the changeLog in reverse
 * and restoring the original (oldest) value for each changed field.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot revert" },
      { status: 403 }
    );
  }

  const { id } = await params;

  const [product] = await db
    .select()
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (!product.isDirty) {
    return NextResponse.json({ error: "No changes to revert" }, { status: 400 });
  }

  const changeLog = product.changeLog ?? [];
  if (changeLog.length === 0) {
    // No changelog but dirty — just clear the flag
    await db
      .update(master)
      .set({ isDirty: false, updatedAt: new Date() })
      .where(eq(master.id, id));
    return NextResponse.json({ success: true, reverted: 0 });
  }

  // Build map: field → original value (the oldValue from the FIRST change to that field)
  const originalValues = new Map<string, string | null>();
  for (const entry of changeLog) {
    if (!originalValues.has(entry.field)) {
      originalValues.set(entry.field, entry.oldValue);
    }
  }

  // Apply reversions
  const updates: Record<string, unknown> = {};
  const rawValues = { ...(product.rawColumnValues ?? {}) };

  for (const [bqName, originalValue] of originalValues) {
    const coreField = coreByBqName.get(bqName);

    if (coreField) {
      updates[coreField] = originalValue;
    } else {
      // JSONB field — find and update with dedup
      let found = false;
      for (const blobField of JSONB_FIELDS) {
        const blob = (updates[blobField] ??
          (product as Record<string, unknown>)[blobField]) as Record<string, string> | null;

        if (blob && bqName in blob) {
          if (!found) {
            found = true;
            if (originalValue != null) {
              updates[blobField] = { ...blob, [bqName]: originalValue };
            } else {
              const cleaned = { ...blob };
              delete cleaned[bqName];
              updates[blobField] = cleaned;
            }
          } else {
            const cleaned = { ...blob };
            delete cleaned[bqName];
            updates[blobField] = cleaned;
          }
        }
      }
    }

    // Update raw values
    if (originalValue != null) {
      rawValues[bqName] = originalValue;
    } else {
      delete rawValues[bqName];
    }
  }

  updates.rawColumnValues = rawValues;
  updates.changeLog = [];
  updates.isDirty = false;
  updates.updatedAt = new Date();

  await db.update(master).set(updates).where(eq(master.id, id));

  // Log the revert action
  await db.insert(activityLog).values({
    productId: id,
    asin: product.asin,
    sku: product.sku,
    clientIdCode: product.clientIdCode,
    itemName: product.itemName,
    fieldLabel: "Revert all changes",
    bqName: "_revert",
    oldValue: `${originalValues.size} fields`,
    newValue: null,
    changedBy: session.user.email!,
    editType: "single",
  });

  return NextResponse.json({ success: true, reverted: originalValues.size });
}
