import { hasAdminPowers } from "@/lib/roles";
/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/server-sequential-independent-await */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master, activityLog, fieldComments, aac, variations } from "@/lib/db/schema";
import { createImpactSnapshot } from "@/lib/impact-snapshots";
import { eq, and, sql, count } from "drizzle-orm";
import {
  COMPUTED_FIELDS,
  getTriggeredComputedFields,
  computeUUID,
  computeSummarizedTitle,
  computeAmazonPdpUrl,
} from "@/lib/computed-fields";
import { applyParentThemeFillToProductUpdates } from "@/lib/seo/parent-variation-fill";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const product = await db
    .select()
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (product.length === 0) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  // Fetch comment counts grouped by bqName
  const commentRows = await db
    .select({
      bqName: fieldComments.bqName,
      total: count(),
      open: count(
        sql`CASE WHEN ${fieldComments.resolved} = false THEN 1 END`
      ),
    })
    .from(fieldComments)
    .where(eq(fieldComments.productId, id))
    .groupBy(fieldComments.bqName);

  const _commentCounts: Record<string, { total: number; open: number }> = {};
  for (const row of commentRows) {
    _commentCounts[row.bqName] = { total: row.total, open: row.open };
  }

  // Fetch AAC data for this client (Intentwise ID, Marketplace, Country, Brand Name, Brand URL, Client Name)
  let _aacData: { intentwiseId: string | null; marketplace: string | null; country: string | null; brandName: string | null; brandURL: string | null; clientName: string | null } = {
    intentwiseId: null, marketplace: null, country: null, brandName: null, brandURL: null, clientName: null,
  };
  if (product[0].clientIdCode) {
    const [aacRow] = await db
      .select({ rawData: aac.rawData })
      .from(aac)
      .where(eq(aac.clientIdCode, product[0].clientIdCode))
      .limit(1);
    if (aacRow?.rawData) {
      const raw = typeof aacRow.rawData === "string"
        ? JSON.parse(aacRow.rawData)
        : aacRow.rawData;
      _aacData = {
        intentwiseId: raw?.IntentwiseID || raw?.["Intentwise ID"] || null,
        marketplace: raw?.Marketplace || null,
        country: raw?.Country || null,
        brandName: raw?.BrandName || null,
        brandURL: raw?.BrandURL || raw?.BrandUrl || null,
        clientName: raw?.ClientName || null,
      };
    }
  }

  // Resolve parent SKU/ASIN for child listings from the variation they belong to.
  // parent_sku can already be set while parent_asin is still empty — still look up.
  let _parentInfo: { sku: string | null; asin: string | null } | null = null;
  const p = product[0];
  const level = p.parentageLevel?.toLowerCase();
  if (level === "child" && (!p.parentAsin || !p.parentSku)) {
    let parentRow: { sku: string | null; asin: string | null } | undefined;
    if (p.variationRef) {
      [parentRow] = await db
        .select({ sku: master.sku, asin: master.asin })
        .from(master)
        .where(
          and(
            eq(master.variationRef, p.variationRef),
            sql`lower(${master.parentageLevel}) = 'parent'`
          )
        )
        .limit(1);
    }
    if (!parentRow?.asin && p.parentSku) {
      [parentRow] = await db
        .select({ sku: master.sku, asin: master.asin })
        .from(master)
        .where(
          and(
            eq(master.sku, p.parentSku),
            sql`lower(${master.parentageLevel}) = 'parent'`
          )
        )
        .limit(1);
    }
    if (parentRow) {
      _parentInfo = { sku: parentRow.sku, asin: parentRow.asin };
    }
  }

  // Fetch Variation name linked via variationRef
  let _variationName: string | null = null;
  if (product[0].variationRef) {
    const [varRow] = await db
      .select({ name: variations.name })
      .from(variations)
      .where(eq(variations.id, product[0].variationRef))
      .limit(1);
    if (varRow) {
      _variationName = varRow.name;
    }
  }

  // Extract flavor and size from product variations JSONB
  const productVariations = product[0].variations as Record<string, string> | null;
  const _flavor = productVariations?.Flavor ?? null;
  const _size = productVariations?.Size ?? null;

  return NextResponse.json({ ...product[0], _commentCounts, _aacData, _parentInfo, _variationName, _flavor, _size });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json({ error: "Forbidden: viewers cannot edit" }, { status: 403 });
  }

  const { id } = await params;

  const body = await req.json();
  const { field, value, bqName } = body as {
    field: string;
    value: string | null;
    bqName: string;
  };

  // Reject direct edits to computed fields
  if (COMPUTED_FIELDS.has(bqName) || bqName === "IntentwiseID") {
    return NextResponse.json(
      { error: `${bqName} is a computed field and cannot be edited directly` },
      { status: 400 }
    );
  }

  // Enforce ASIN must be exactly 10 characters
  if ((bqName === "ASIN" || bqName === "ParentASIN") && value != null && value.length !== 10) {
    return NextResponse.json(
      { error: "ASIN must be exactly 10 characters" },
      { status: 400 }
    );
  }

  // Fetch current product
  const [product] = await db
    .select()
    .from(master)
    .where(eq(master.id, id))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const jsonbFields = [
    "contentSeo", "variations", "packaging", "targetAudience",
    "fulfillment", "productAttributes", "nutritionSupplements",
    "complianceSafety", "images", "dimensionsWeight", "otherAttributes",
  ] as const;

  // Determine old value for change log
  let oldValue: string | null = null;
  const updates: Record<string, unknown> = {};

  // Check if it's a core field
  if (field && field in product) {
    oldValue = (product as Record<string, unknown>)[field] as string | null;
    updates[field] = value;
  } else {
    // It's a JSONB field — find which blob has it, and update there.
    // Also remove stale copies from ALL other blobs to prevent overwrites during publish.
    const VARIATION_KEYS = new Set([
      "VariationID", "VariationProduct", "VariationThemeName",
      "ChildRelationshipType", "Color", "Size", "Flavor", "Style",
      "Scent", "Material", "Pattern", "Count", "NumberOfItems",
    ]);
    // For variation keys, always write to the variations blob
    const canonicalBlob = VARIATION_KEYS.has(bqName) ? "variations" : null;
    let primaryBlob: string | null = null;

    for (const blobField of jsonbFields) {
      const blob = (product as Record<string, unknown>)[blobField] as Record<string, string> | null;
      if (blob && bqName in blob) {
        // If this key belongs in a canonical blob and this isn't it, treat as stale
        if (canonicalBlob && blobField !== canonicalBlob) {
          const newBlob = { ...blob };
          delete newBlob[bqName];
          updates[blobField] = newBlob;
          if (!primaryBlob) oldValue = blob[bqName] ?? null;
          continue;
        }
        if (!primaryBlob) {
          // First blob with this key — update it here
          primaryBlob = blobField;
          oldValue = blob[bqName] ?? null;
          if (value == null) {
            const newBlob = { ...blob };
            delete newBlob[bqName];
            updates[blobField] = newBlob;
          } else {
            updates[blobField] = { ...blob, [bqName]: value };
          }
        } else {
          // Duplicate key in another blob — remove the stale copy
          const newBlob = { ...blob };
          delete newBlob[bqName];
          updates[blobField] = newBlob;
        }
      }
    }

    // If not found in canonical blob (or any blob), write to the correct one
    if (!primaryBlob && bqName) {
      const targetBlob = canonicalBlob ?? "otherAttributes";
      const current = ((product as Record<string, unknown>)[targetBlob] as Record<string, string>) ?? {};
      if (!oldValue) oldValue = current[bqName] ?? null;
      updates[targetBlob] = { ...current, ...(value != null ? { [bqName]: value } : {}) };
    }
  }

  // Update raw_column_values too
  const rawValues = { ...(product.rawColumnValues ?? {}) };
  if (bqName) {
    if (value != null) {
      rawValues[bqName] = value;
    } else {
      delete rawValues[bqName];
    }
  }

  // Recompute dependent computed fields
  const triggered = getTriggeredComputedFields(bqName, field);
  for (const computedField of triggered) {
    if (computedField === "UUID") {
      const asin = (updates.asin !== undefined ? updates.asin : product.asin) as string | null;
      const sku = (updates.sku !== undefined ? updates.sku : product.sku) as string | null;
      const cid = (updates.clientIdCode !== undefined ? updates.clientIdCode : product.clientIdCode) as string | null;
      const newUUID = computeUUID(asin, sku, cid);
      rawValues["UUID"] = newUUID;
      // Update in any JSONB blob that has UUID
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

  // Append to change log
  const changeLog = [...(product.changeLog ?? [])];
  const changedAt = new Date().toISOString();
  changeLog.push({
    field: bqName || field,
    oldValue,
    newValue: value,
    changedBy: session.user.email,
    changedAt,
  });

  applyParentThemeFillToProductUpdates({
    product: {
      parentageLevel: product.parentageLevel,
      variations: (product.variations as Record<string, string> | null) ?? null,
      rawColumnValues: product.rawColumnValues ?? null,
    },
    bqName,
    value,
    updates,
    rawValues,
    changeLog,
    changedBy: session.user.email!,
    changedAt,
  });
  updates.rawColumnValues = rawValues;

  updates.changeLog = changeLog;
  updates.isDirty = true;
  updates.updatedAt = new Date();

  await db.update(master).set(updates).where(eq(master.id, id));

  // Write to activity log
  await db.insert(activityLog).values({
    productId: id,
    asin: product.asin,
    sku: product.sku,
    clientIdCode: product.clientIdCode,
    itemName: product.itemName,
    fieldLabel: field || bqName,
    bqName,
    oldValue,
    newValue: value,
    changedBy: session.user.email!,
    editType: "single",
  });

  // Revenue attribution: create impact snapshot. Deferred with after(), not
  // fired-and-forgotten: this INSERTs into content_impact_snapshots, and an
  // un-awaited write is abandoned mid-protocol when Vercel freezes the sandbox,
  // pinning a Supavisor pool slot. See src/lib/sales-cache.awaited.test.ts.
  if (product.clientIdCode) {
    const clientIdCode = product.clientIdCode;
    after(async () => {
      try {
        await createImpactSnapshot({
          clientIdCode,
          productId: id,
          asin: product.asin ?? undefined,
          changeType: "product_edit",
          changeSummary: `${field || bqName}: "${oldValue}" → "${value}"`,
          changeCount: 1,
          changedBy: session.user.email!,
        });
      } catch (err) {
        console.error("[ImpactSnapshot] product_edit failed:", err);
      }
    });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "viewer")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { isVp } = (await req.json()) as { isVp: boolean };

  await db.update(master).set({ isVp: Boolean(isVp) }).where(eq(master.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session || !hasAdminPowers(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Delete related records first
  await db.delete(fieldComments).where(eq(fieldComments.productId, id));
  await db.delete(master).where(eq(master.id, id));

  return NextResponse.json({ success: true });
}
