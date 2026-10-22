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
 * POST /api/products/[id]/revert-field
 * Reverts a single field to its original value (before any edits).
 * Body: { bqName: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { bqName } = (await req.json()) as { bqName: string };

  if (!bqName) {
    return NextResponse.json({ error: "bqName is required" }, { status: 400 });
  }

  const [product] = await db
    .select()
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const changeLog = product.changeLog ?? [];

  // Find the original value — the oldValue from the FIRST change to this field
  const firstEntry = changeLog.find((e) => e.field === bqName);
  if (!firstEntry) {
    return NextResponse.json({ error: "No changes found for this field" }, { status: 400 });
  }

  const originalValue = firstEntry.oldValue;

  // Apply the original value back
  const updates: Record<string, unknown> = {};
  const rawValues = { ...(product.rawColumnValues ?? {}) };
  const coreField = coreByBqName.get(bqName);

  if (coreField) {
    updates[coreField] = originalValue;
  } else {
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

  if (originalValue != null) {
    rawValues[bqName] = originalValue;
  } else {
    delete rawValues[bqName];
  }

  // Remove all changeLog entries for this field
  const newChangeLog = changeLog.filter((e) => e.field !== bqName);

  updates.rawColumnValues = rawValues;
  updates.changeLog = newChangeLog;
  updates.isDirty = newChangeLog.length > 0;
  updates.updatedAt = new Date();

  await db.update(master).set(updates).where(eq(master.id, id));

  // Activity log
  await db.insert(activityLog).values({
    productId: id,
    asin: product.asin,
    sku: product.sku,
    clientIdCode: product.clientIdCode,
    itemName: product.itemName,
    fieldLabel: `Reverted ${bqName}`,
    bqName,
    oldValue: null,
    newValue: originalValue,
    changedBy: session.user.email!,
    editType: "single",
  });

  return NextResponse.json({ success: true });
}
