/* eslint-disable react-doctor/js-combine-iterations */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { getSeoVersion } from "@/lib/bigquery";
import { db } from "@/lib/db";
import { master, activityLog, seoAsins } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { CORE_COLUMNS } from "@/lib/column-registry";
import { normalizeSeoVersionNumber } from "@/lib/seo-product-options";
import { inheritedContentToSeoRow } from "@/lib/seo-inherited";

/** SEO content fields to copy from BQ version into the product */
const SEO_CONTENT_FIELDS = [
  "ItemName",
  "DetailedBulletPoint1",
  "DetailedBulletPoint2",
  "DetailedBulletPoint3",
  "DetailedBulletPoint4",
  "DetailedBulletPoint5",
  "ProductDescription",
  "GenericKeyword1",
  "GenericKeyword2",
  "GenericKeyword3",
  "GenericKeyword4",
  "GenericKeyword5",
  "ConciseBulletPoint1",
  "ConciseBulletPoint2",
  "ConciseBulletPoint3",
  "ConciseBulletPoint4",
  "ConciseBulletPoint5",
  "PA_LIBulletPoint1",
  "PA_LIBulletPoint2",
  "PA_LIBulletPoint3",
  "PA_LIBulletPoint4",
  "PA_LIBulletPoint5",
  "KeyFeature1",
  "KeyFeature2",
  "KeyFeature3",
  "KeyFeature4",
  "KeyFeature5",
];

/** SEO metadata fields to copy */
const SEO_META_FIELDS = [
  "SEOVersionNumber",
  "SEOCategory",
  "SEOStatus",
  "SEODocURL",
];

const JSONB_FIELDS = [
  "contentSeo",
  "variations",
  "packaging",
  "targetAudience",
  "fulfillment",
  "productAttributes",
  "nutritionSupplements",
  "complianceSafety",
  "images",
  "dimensionsWeight",
  "otherAttributes",
] as const;

const coreByBqName = new Map(
  CORE_COLUMNS.filter((c) => c.coreField).map((c) => [c.bqName, c.coreField!])
);

function bqCell(row: Record<string, unknown>, bqName: string): string {
  const raw = row[bqName];
  if (raw == null) return "";
  return String(raw);
}

async function loadInheritedClrRow(asin: string, sku: string): Promise<Record<string, string> | null> {
  const rows = await db
    .select({
      existingContent: seoAsins.existingContent,
      asin: seoAsins.asin,
      sku: seoAsins.sku,
    })
    .from(seoAsins)
    .where(or(eq(seoAsins.sku, sku), eq(seoAsins.asin, asin)))
    .limit(20);

  const exact =
    rows.find((r) => r.sku === sku && r.asin === asin) ??
    rows.find((r) => r.sku === sku) ??
    rows.find((r) => r.asin === asin) ??
    rows[0];
  return inheritedContentToSeoRow(exact?.existingContent);
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "viewer") {
    return NextResponse.json(
      { error: "Forbidden: viewers cannot activate SEO versions" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { productId, seoVersionNumber, seoCategory, asin, sku } = body as {
    productId: string;
    seoVersionNumber: unknown;
    seoCategory: string;
    asin: string;
    sku: string;
  };

  const version = normalizeSeoVersionNumber(seoVersionNumber);
  if (!productId || version == null || !seoCategory || !asin || !sku) {
    return NextResponse.json(
      { error: "productId, seoVersionNumber, seoCategory, asin, and sku are required" },
      { status: 400 }
    );
  }

  // 1. Fetch current product first so version 0 can restore CLR copy from Hub
  const [product] = await db
    .select()
    .from(master)
    .where(eq(master.id, productId))
    .limit(1);

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let seoRow: Record<string, unknown> | null = null;

  if (version === "0") {
    try {
      seoRow = await loadInheritedClrRow(asin, sku);
    } catch (err) {
      console.error("Failed to load inherited CLR listing from Hub:", err);
    }
    if (!seoRow) {
      try {
        seoRow = await getSeoVersion(asin, sku, version, seoCategory);
      } catch (err) {
        console.error("Failed to fetch SEO version 0 from BigQuery:", err);
      }
    }
    if (!seoRow) {
      seoRow = {
        SEOVersionNumber: "0",
        SEOCategory: "Inherited",
        SEOStatus: "Onboarding",
      };
    }
  } else {
    try {
      seoRow = await getSeoVersion(asin, sku, version, seoCategory);
    } catch (err) {
      console.error("Failed to fetch SEO version from BigQuery:", err);
      return NextResponse.json(
        { error: "Failed to fetch SEO version" },
        { status: 500 }
      );
    }
    if (!seoRow) {
      return NextResponse.json(
        { error: "SEO version not found in BigQuery" },
        { status: 404 }
      );
    }
  }

  // 2. Build updates — apply all SEO fields using JSONB dedup pattern
  const updates: Record<string, unknown> = {};
  const rawValues = { ...(product.rawColumnValues ?? {}) };
  const changeLog = [...(product.changeLog ?? [])];
  const hasListingCopy =
    version !== "0" ||
    Boolean(bqCell(seoRow, "ItemName")) ||
    Boolean(bqCell(seoRow, "ProductDescription")) ||
    Boolean(bqCell(seoRow, "DetailedBulletPoint1"));
  const allFieldsToApply = hasListingCopy
    ? [...SEO_CONTENT_FIELDS, ...SEO_META_FIELDS]
    : [...SEO_META_FIELDS];

  for (const bqName of allFieldsToApply) {
    const newValue = bqCell(seoRow, bqName);
    const coreField = coreByBqName.get(bqName);

    if (coreField) {
      // Core column — update directly
      updates[coreField] = newValue === "" ? null : newValue;
    } else {
      // JSONB field — find which blob has it, update with dedup
      let primaryBlob: string | null = null;

      for (const blobField of JSONB_FIELDS) {
        const blob = (updates[blobField] ??
          (product as Record<string, unknown>)[blobField]) as Record<
          string,
          string
        > | null;

        if (blob && bqName in blob) {
          if (!primaryBlob) {
            primaryBlob = blobField;
            updates[blobField] = { ...blob, [bqName]: newValue };
          } else {
            // Remove stale duplicate
            const cleaned = { ...blob };
            delete cleaned[bqName];
            updates[blobField] = cleaned;
          }
        }
      }

      // If not in any blob, add to contentSeo (SEO fields' natural home)
      if (!primaryBlob) {
        const current =
          (updates.contentSeo as Record<string, string>) ??
          ((product.contentSeo as Record<string, string>) ?? {});
        updates.contentSeo = { ...current, [bqName]: newValue };
      }
    }

    // Update raw values
    if (newValue !== "") {
      rawValues[bqName] = newValue;
    } else {
      delete rawValues[bqName];
    }

    // Add to change log
    const oldValue =
      product.rawColumnValues?.[bqName] ?? null;
    if (oldValue !== newValue) {
      changeLog.push({
        field: bqName,
        oldValue,
        newValue: newValue || null,
        changedBy: session.user.email!,
        changedAt: new Date().toISOString(),
      });
    }
  }

  rawValues.SEOVersionNumber = version;
  const seoBlob =
    (updates.contentSeo as Record<string, string> | undefined) ??
    { ...(product.contentSeo ?? {}) };
  updates.contentSeo = { ...seoBlob, SEOVersionNumber: version };

  updates.rawColumnValues = rawValues;
  updates.changeLog = changeLog;
  updates.isDirty = true;
  updates.updatedAt = new Date();

  await db.update(master).set(updates).where(eq(master.id, productId));

  // 4. Activity log entry
  await db.insert(activityLog).values({
    productId,
    asin: product.asin,
    sku: product.sku,
    clientIdCode: product.clientIdCode,
    itemName: product.itemName,
    fieldLabel: `SEO Version ${version} (${seoCategory})`,
    bqName: "SEOVersionNumber",
    oldValue: product.rawColumnValues?.["SEOVersionNumber"] ?? null,
    newValue: version,
    changedBy: session.user.email!,
    editType: "single",
  });

  return NextResponse.json({ success: true });
}
