import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master, type VariationData } from "@/lib/db/schema";
import { and, eq, ilike, inArray, or, sql, asc, desc } from "drizzle-orm";
import type { HubASIN } from "@/lib/bigquery";
import { getAuthSession } from "@/lib/auth-db";

export const maxDuration = 60;

/**
 * Map a Hub product row to the HubASIN shape expected by the SEO intake page.
 * Pulls from core columns first, then JSONB blobs, then rawColumnValues.
 */
function mapProductToASIN(row: {
  asin: string | null;
  sku: string | null;
  clientIdCode: string | null;
  marketplace: string | null;
  country: string | null;
  brandName: string | null;
  status: string | null;
  summarizedTitle: string | null;
  parentageLevel: string | null;
  parentSku: string | null;
  parentAsin: string | null;
  itemName: string | null;
  listPrice: string | null;
  productType: string | null;
  itemTypeKeyword: string | null;
  variations: VariationData | null;
  contentSeo: Record<string, string> | null;
  targetAudience: Record<string, string> | null;
  productAttributes: Record<string, string> | null;
  nutritionSupplements: Record<string, string> | null;
  rawColumnValues: Record<string, string> | null;
  variationGroup: string | null;
}): HubASIN & { VariationGroup: string | null } {
  const v = row.variations || {};
  const cs = row.contentSeo || {};
  const ta = row.targetAudience || {};
  const pa = row.productAttributes || {};
  const ns = row.nutritionSupplements || {};
  const raw = row.rawColumnValues || {};

  // Helper: get value from JSONB blobs or rawColumnValues
  const get = (key: string, ...blobs: Record<string, string | undefined>[]): string | null => {
    for (const blob of blobs) {
      if (blob[key]) return blob[key];
    }
    return raw[key] || null;
  };

  return {
    ASIN: row.asin,
    SKU: row.sku,
    ClientIDCode: row.clientIdCode,
    Marketplace: row.marketplace,
    Country: row.country,
    BrandName: row.brandName,
    Status: row.status,
    SummarizedTitle: row.summarizedTitle,
    AmazonPDPURL: get("AmazonPDPURL", raw),
    WebsitePDPURL: get("WebsitePDPURL", raw),
    VariationID: get("VariationID", v),
    VariationProduct: get("VariationProduct", v),
    ParentageLevel: row.parentageLevel,
    ChildRelationshipType: get("ChildRelationshipType", v),
    ParentSKU: row.parentSku,
    ParentASIN: row.parentAsin,
    VariationThemeName: get("VariationThemeName", v),
    Flavor: get("Flavor", v),
    Style: get("Style", v),
    Color: get("Color", v),
    Size: get("Size", v),
    ProductType: row.productType,
    ItemTypeKeyword: row.itemTypeKeyword,
    ProductCategory: get("ProductCategory", pa),
    ProductSubcategory: get("ProductSubcategory", pa),
    ItemName: row.itemName,
    DetailedBulletPoint1: get("DetailedBulletPoint1", cs),
    DetailedBulletPoint2: get("DetailedBulletPoint2", cs),
    DetailedBulletPoint3: get("DetailedBulletPoint3", cs),
    DetailedBulletPoint4: get("DetailedBulletPoint4", cs),
    DetailedBulletPoint5: get("DetailedBulletPoint5", cs),
    ProductDescription: get("ProductDescription", cs),
    GenericKeyword1: get("GenericKeyword1", cs),
    GenericKeyword2: get("GenericKeyword2", cs),
    GenericKeyword3: get("GenericKeyword3", cs),
    GenericKeyword4: get("GenericKeyword4", cs),
    GenericKeyword5: get("GenericKeyword5", cs),
    ConciseBulletPoint1: get("ConciseBulletPoint1", cs),
    ConciseBulletPoint2: get("ConciseBulletPoint2", cs),
    ConciseBulletPoint3: get("ConciseBulletPoint3", cs),
    ConciseBulletPoint4: get("ConciseBulletPoint4", cs),
    ConciseBulletPoint5: get("ConciseBulletPoint5", cs),
    PA_LIBulletPoint1: get("PA_LIBulletPoint1", cs),
    PA_LIBulletPoint2: get("PA_LIBulletPoint2", cs),
    PA_LIBulletPoint3: get("PA_LIBulletPoint3", cs),
    PA_LIBulletPoint4: get("PA_LIBulletPoint4", cs),
    PA_LIBulletPoint5: get("PA_LIBulletPoint5", cs),
    KeyFeature1: get("KeyFeature1", cs),
    KeyFeature2: get("KeyFeature2", cs),
    KeyFeature3: get("KeyFeature3", cs),
    KeyFeature4: get("KeyFeature4", cs),
    KeyFeature5: get("KeyFeature5", cs),
    TargetAudience1: get("TargetAudience1", ta),
    TargetAudience2: get("TargetAudience2", ta),
    TargetAudience3: get("TargetAudience3", ta),
    TargetAudience4: get("TargetAudience4", ta),
    TargetAudience5: get("TargetAudience5", ta),
    RecommendedUsesForProduct1: get("RecommendedUsesForProduct1", pa),
    RecommendedUsesForProduct2: get("RecommendedUsesForProduct2", pa),
    RecommendedUsesForProduct3: get("RecommendedUsesForProduct3", pa),
    RecommendedUsesForProduct4: get("RecommendedUsesForProduct4", pa),
    RecommendedUsesForProduct5: get("RecommendedUsesForProduct5", pa),
    SpecificUsesforProduct1: get("SpecificUsesforProduct1", pa),
    SpecificUsesforProduct2: get("SpecificUsesforProduct2", pa),
    SpecificUsesforProduct3: get("SpecificUsesforProduct3", pa),
    SpecificUsesforProduct4: get("SpecificUsesforProduct4", pa),
    SpecificUsesforProduct5: get("SpecificUsesforProduct5", pa),
    DietType1: get("DietType1", ns),
    DietType2: get("DietType2", ns),
    DietType3: get("DietType3", ns),
    DietType4: get("DietType4", ns),
    DietType5: get("DietType5", ns),
    Ingredients1: get("Ingredients1", ns),
    Ingredients2: get("Ingredients2", ns),
    Ingredients3: get("Ingredients3", ns),
    Ingredients4: get("Ingredients4", ns),
    Ingredients5: get("Ingredients5", ns),
    ProductBenefits1: get("ProductBenefits1", pa),
    ProductBenefits2: get("ProductBenefits2", pa),
    ProductBenefits3: get("ProductBenefits3", pa),
    ProductBenefits4: get("ProductBenefits4", pa),
    ProductBenefits5: get("ProductBenefits5", pa),
    SpecialFeatures1: get("SpecialFeatures1", pa),
    SpecialFeatures2: get("SpecialFeatures2", pa),
    SpecialFeatures3: get("SpecialFeatures3", pa),
    SpecialFeatures4: get("SpecialFeatures4", pa),
    SpecialFeatures5: get("SpecialFeatures5", pa),
    ItemForm1: get("ItemForm1", pa),
    FormFactor: get("FormFactor", pa),
    UnitCount: get("UnitCount", pa),
    UnitCountType: get("UnitCountType", pa),
    ListPrice: row.listPrice,
    Manufacturer: get("Manufacturer", pa),
    VariationGroup: row.variationGroup,
  };
}

// Columns to select from products table
const selectColumns = {
  asin: master.asin,
  sku: master.sku,
  clientIdCode: master.clientIdCode,
  marketplace: master.marketplace,
  country: master.country,
  brandName: master.brandName,
  status: master.status,
  summarizedTitle: master.summarizedTitle,
  parentageLevel: master.parentageLevel,
  parentSku: master.parentSku,
  parentAsin: master.parentAsin,
  itemName: master.itemName,
  listPrice: master.listPrice,
  productType: master.productType,
  itemTypeKeyword: master.itemTypeKeyword,
  variations: master.variations,
  contentSeo: master.contentSeo,
  targetAudience: master.targetAudience,
  productAttributes: master.productAttributes,
  nutritionSupplements: master.nutritionSupplements,
  rawColumnValues: master.rawColumnValues,
  variationGroup: master.variationGroup,
} as const;

/**
 * GET /api/seo/bq/asins
 * Fetch paginated ASIN list from Hub's PostgreSQL products table.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const clientIDCode = searchParams.get("clientIDCode");
    if (!clientIDCode) {
      return NextResponse.json({ error: "clientIDCode is required" }, { status: 400 });
    }

    const conditions = [eq(master.clientIdCode, clientIDCode)];

    const parentageLevel = searchParams.get("parentageLevel");
    if (parentageLevel) conditions.push(ilike(master.parentageLevel, parentageLevel));

    const variationThemeName = searchParams.get("variationThemeName");
    if (variationThemeName) {
      conditions.push(sql`${master.variations}->>'VariationThemeName' = ${variationThemeName}`);
    }

    const variationID = searchParams.get("variationID");
    if (variationID) {
      conditions.push(sql`${master.variations}->>'VariationID' = ${variationID}`);
    }

    const productCategory = searchParams.get("productCategory");
    if (productCategory) {
      conditions.push(sql`${master.productAttributes}->>'ProductCategory' = ${productCategory}`);
    }

    const productSubcategory = searchParams.get("productSubcategory");
    if (productSubcategory) {
      conditions.push(sql`${master.productAttributes}->>'ProductSubcategory' = ${productSubcategory}`);
    }

    const flavor = searchParams.get("flavor");
    if (flavor) conditions.push(sql`${master.variations}->>'Flavor' = ${flavor}`);

    const style = searchParams.get("style");
    if (style) conditions.push(sql`${master.variations}->>'Style' = ${style}`);

    const color = searchParams.get("color");
    if (color) conditions.push(sql`${master.variations}->>'Color' = ${color}`);

    const size = searchParams.get("size");
    if (size) conditions.push(sql`${master.variations}->>'Size' = ${size}`);

    const statusFilter = searchParams.get("status");
    if (statusFilter) conditions.push(ilike(master.status, statusFilter));

    const searchTerm = searchParams.get("searchTerm");
    if (searchTerm) {
      const pattern = `%${searchTerm}%`;
      conditions.push(
        or(
          ilike(master.asin, pattern),
          ilike(master.sku, pattern),
          ilike(master.summarizedTitle, pattern)
        )!
      );
    }

    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(master)
      .where(and(...conditions));

    // Get paginated results — group by VariationID, parent first then children
    const rows = await db
      .select(selectColumns)
      .from(master)
      .where(and(...conditions))
      .orderBy(sql`${master.variations}->>'VariationID' ASC NULLS LAST`, desc(master.parentageLevel), asc(master.asin))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      asins: rows.map(mapProductToASIN),
      totalCount: count,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch ASINs";
    console.error("ASINs GET error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/seo/bq/asins
 * Fetch full ASIN data for selected ASINs.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { asins: asinList, clientIDCode } = await request.json();
    if (!clientIDCode) {
      return NextResponse.json({ error: "clientIDCode is required" }, { status: 400 });
    }
    if (!asinList?.length) {
      return NextResponse.json({ error: "asins array is required" }, { status: 400 });
    }

    const rows = await db
      .select(selectColumns)
      .from(master)
      .where(
        and(
          eq(master.clientIdCode, clientIDCode),
          inArray(master.asin, asinList)
        )
      )
      .orderBy(sql`${master.variations}->>'VariationID' ASC NULLS LAST`, desc(master.parentageLevel), asc(master.asin));

    return NextResponse.json({ asins: rows.map(mapProductToASIN) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch full ASIN data";
    console.error("ASINs POST error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
