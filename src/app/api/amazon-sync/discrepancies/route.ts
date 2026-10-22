import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { amazonSyncDiscrepancies, master, activityLog } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { SYNC_FIELDS } from "@/lib/amazon-sync-field-map";
import {
  COMPUTED_FIELDS,
  getTriggeredComputedFields,
  computeUUID,
  computeSummarizedTitle,
  computeAmazonPdpUrl,
} from "@/lib/computed-fields";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const clientIdCode = searchParams.get("client_id");
  const productId = searchParams.get("product_id");
  const status = searchParams.get("status");
  const resolved = searchParams.get("resolved");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "100");

  // Build where conditions
  const conditions = [];
  if (clientIdCode)
    conditions.push(eq(amazonSyncDiscrepancies.clientIdCode, clientIdCode));
  if (productId)
    conditions.push(eq(amazonSyncDiscrepancies.productId, productId));
  if (status) conditions.push(eq(amazonSyncDiscrepancies.status, status));
  if (resolved !== null && resolved !== undefined) {
    conditions.push(
      eq(amazonSyncDiscrepancies.resolved, resolved === "true")
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(amazonSyncDiscrepancies)
    .where(where);
  const total = Number(countResult.count);

  const rows = await db
    .select({
      id: amazonSyncDiscrepancies.id,
      snapshotId: amazonSyncDiscrepancies.snapshotId,
      productId: amazonSyncDiscrepancies.productId,
      clientIdCode: amazonSyncDiscrepancies.clientIdCode,
      asin: amazonSyncDiscrepancies.asin,
      fieldName: amazonSyncDiscrepancies.fieldName,
      fieldGroup: amazonSyncDiscrepancies.fieldGroup,
      catalogValue: amazonSyncDiscrepancies.catalogValue,
      amazonValue: amazonSyncDiscrepancies.amazonValue,
      status: amazonSyncDiscrepancies.status,
      resolved: amazonSyncDiscrepancies.resolved,
      resolvedAction: amazonSyncDiscrepancies.resolvedAction,
      resolvedAt: amazonSyncDiscrepancies.resolvedAt,
      resolvedBy: amazonSyncDiscrepancies.resolvedBy,
      createdAt: amazonSyncDiscrepancies.createdAt,
      productTitle: master.itemName,
      productAsin: master.asin,
    })
    .from(amazonSyncDiscrepancies)
    .leftJoin(master, eq(amazonSyncDiscrepancies.productId, master.id))
    .where(where)
    .orderBy(amazonSyncDiscrepancies.createdAt)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({
    data: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// PATCH — resolve/unresolve a discrepancy
export async function PATCH(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { id, resolved, resolvedAction } = body as {
    id: string;
    resolved: boolean;
    resolvedAction?: "update_amazon" | "update_hub" | null;
  };

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // If "update_hub", write the Amazon value into the product (Supabase + marks dirty for BQ publish)
  if (resolved && resolvedAction === "update_hub") {
    // Fetch the discrepancy
    const [disc] = await db
      .select()
      .from(amazonSyncDiscrepancies)
      .where(eq(amazonSyncDiscrepancies.id, id))
      .limit(1);

    if (!disc) {
      return NextResponse.json({ error: "Discrepancy not found" }, { status: 404 });
    }

    // Find the sync field definition to get the bqName
    const syncField = SYNC_FIELDS.find((f) => f.field_name === disc.fieldName);
    const bqName = syncField?.bqName;

    if (!bqName) {
      // Field has no catalog mapping — can't write back, just mark resolved
      await db
        .update(amazonSyncDiscrepancies)
        .set({
          resolved: true,
          resolvedAction: "update_hub",
          resolvedAt: new Date(),
          resolvedBy: session.user.email ?? null,
        })
        .where(eq(amazonSyncDiscrepancies.id, id));

      return NextResponse.json({ success: true, warning: "Field has no catalog mapping — marked resolved but no data updated" });
    }

    // Fetch current product
    const [product] = await db
      .select()
      .from(master)
      .where(eq(master.id, disc.productId))
      .limit(1);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const newValue = disc.amazonValue;

    // Reject computed fields
    if (COMPUTED_FIELDS.has(bqName)) {
      return NextResponse.json({ error: `${bqName} is a computed field` }, { status: 400 });
    }

    const jsonbFields = [
      "contentSeo", "variations", "packaging", "targetAudience",
      "fulfillment", "productAttributes", "nutritionSupplements",
      "complianceSafety", "images", "dimensionsWeight", "otherAttributes",
    ] as const;

    let oldValue: string | null = null;
    const updates: Record<string, unknown> = {};

    // Check core fields first
    const coreField = Object.keys(product).find((k) => k === bqName.charAt(0).toLowerCase() + bqName.slice(1));
    if (coreField && coreField in product) {
      oldValue = (product as Record<string, unknown>)[coreField] as string | null;
      updates[coreField] = newValue;
    } else {
      // JSONB field — find and update in the right blob
      let primaryBlob: string | null = null;

      for (const blobField of jsonbFields) {
        const blob = (product as Record<string, unknown>)[blobField] as Record<string, string> | null;
        if (blob && bqName in blob) {
          if (!primaryBlob) {
            primaryBlob = blobField;
            oldValue = blob[bqName] ?? null;
            if (newValue == null) {
              const newBlob = { ...blob };
              delete newBlob[bqName];
              updates[blobField] = newBlob;
            } else {
              updates[blobField] = { ...blob, [bqName]: newValue };
            }
          } else {
            // Remove stale copy from other blobs
            const newBlob = { ...blob };
            delete newBlob[bqName];
            updates[blobField] = newBlob;
          }
        }
      }

      if (!primaryBlob) {
        // Not found — add to otherAttributes
        const current = (product.otherAttributes as Record<string, string>) ?? {};
        oldValue = current[bqName] ?? null;
        updates.otherAttributes = { ...current, ...(newValue != null ? { [bqName]: newValue } : {}) };
      }
    }

    // Update rawColumnValues
    const rawValues = { ...(product.rawColumnValues ?? {}) };
    if (newValue != null) {
      rawValues[bqName] = newValue;
    } else {
      delete rawValues[bqName];
    }

    // Recompute dependent computed fields
    const triggered = getTriggeredComputedFields(bqName, undefined);
    for (const computedField of triggered) {
      if (computedField === "UUID") {
        const asin = (updates.asin !== undefined ? updates.asin : product.asin) as string | null;
        const sku = (updates.sku !== undefined ? updates.sku : product.sku) as string | null;
        const cid = (updates.clientIdCode !== undefined ? updates.clientIdCode : product.clientIdCode) as string | null;
        const newUUID = computeUUID(asin, sku, cid);
        rawValues["UUID"] = newUUID;
        for (const bf of jsonbFields) {
          const blob = (updates[bf] ?? (product as Record<string, unknown>)[bf]) as Record<string, string> | null;
          if (blob && "UUID" in blob) {
            updates[bf] = { ...blob, UUID: newUUID };
          }
        }
      } else if (computedField === "AmazonPDPURL") {
        const asin = (updates.asin !== undefined ? updates.asin : product.asin) as string | null;
        const newUrl = computeAmazonPdpUrl(asin);
        rawValues["AmazonPDPURL"] = newUrl;
        for (const bf of jsonbFields) {
          const blob = (updates[bf] ?? (product as Record<string, unknown>)[bf]) as Record<string, string> | null;
          if (blob && "AmazonPDPURL" in blob) {
            updates[bf] = { ...blob, AmazonPDPURL: newUrl };
          }
        }
      } else if (computedField === "SummarizedTitle") {
        const r = (k: string) => rawValues[k] ?? null;
        const newTitle = computeSummarizedTitle(r("VariationProduct"), r("Style"), r("Flavor"), r("Color"), r("Size"));
        updates.summarizedTitle = newTitle;
        rawValues["SummarizedTitle"] = newTitle;
      }
    }

    updates.rawColumnValues = rawValues;

    // Change log + dirty flag
    const changeLog = [...(product.changeLog ?? [])];
    changeLog.push({
      field: bqName,
      oldValue,
      newValue,
      changedBy: session.user.email,
      changedAt: new Date().toISOString(),
    });
    updates.changeLog = changeLog;
    updates.isDirty = true;
    updates.updatedAt = new Date();

    // Write product update
    await db.update(master).set(updates).where(eq(master.id, disc.productId));

    // Activity log
    await db.insert(activityLog).values({
      productId: disc.productId,
      asin: product.asin,
      sku: product.sku,
      clientIdCode: product.clientIdCode,
      itemName: product.itemName,
      fieldLabel: syncField?.label ?? bqName,
      bqName,
      oldValue,
      newValue,
      changedBy: session.user.email!,
      editType: "single",
    });
  }

  // Mark discrepancy as resolved/unresolved
  await db
    .update(amazonSyncDiscrepancies)
    .set({
      resolved,
      resolvedAction: resolved ? (resolvedAction ?? null) : null,
      resolvedAt: resolved ? new Date() : null,
      resolvedBy: resolved ? session.user.email ?? null : null,
    })
    .where(eq(amazonSyncDiscrepancies.id, id));

  return NextResponse.json({ success: true });
}
