/**
 * BigQuery Client — 1o8 SEO Manager
 * Connects to amazon-data-461918 project via service account
 * Two datasets: 1o8MAAC (client data) and 1o8MBible (ASIN master data)
 */

import { BigQuery } from "@google-cloud/bigquery";
import * as fs from "fs";
import * as path from "path";

// ─── Configuration ───────────────────────────────────────
const PROJECT_ID = "amazon-data-461918";
const AAC_TABLE = `${PROJECT_ID}.1o8MAAC.1o8MAAC_AAC`;
const BIBLE_TABLE = `${PROJECT_ID}.1o8MBible.1o8MBible_Master`;

// ─── Client singleton ────────────────────────────────────
let bqClient: BigQuery | null = null;

function getClient(): BigQuery {
  if (bqClient) return bqClient;

  // Option 1: File-based credentials (recommended)
  const keyFilePath = process.env.GOOGLE_BQ_KEY_FILE 
    || path.resolve(process.cwd(), "service-account.json");

  if (fs.existsSync(keyFilePath)) {
    bqClient = new BigQuery({
      projectId: PROJECT_ID,
      keyFilename: keyFilePath,
    });
    return bqClient;
  }

  // Option 2: Inline JSON from env var (fallback)
  if (process.env.GOOGLE_BQ_SERVICE_ACCOUNT_KEY) {
    const credentials = JSON.parse(process.env.GOOGLE_BQ_SERVICE_ACCOUNT_KEY);
    bqClient = new BigQuery({
      projectId: PROJECT_ID,
      credentials,
    });
    return bqClient;
  }

  throw new Error(
    "BigQuery credentials not found. Either place service-account.json in project root " +
    "or set GOOGLE_BQ_SERVICE_ACCOUNT_KEY in .env.local"
  );
}

// ─── Types ───────────────────────────────────────────────

export interface AACClient {
  ClientStatus: string | null;
  ClientName: string | null;
  ClientIDCode: string | null;
  BrandName: string | null;
  Marketplace: string | null;
  Country: string | null;
  Tier: number | null;
  BrandURL: string | null;
  ClientBibleURL: string | null;
  ClientBibleID: string | null;
  Competitor1Name: string | null;
  Competitor1URL: string | null;
  Competitor2Name: string | null;
  Competitor2URL: string | null;
  Competitor3Name: string | null;
  Competitor3URL: string | null;
  Competitor4Name: string | null;
  Competitor4URL: string | null;
  Competitor5Name: string | null;
  Competitor5URL: string | null;
}

export interface BibleASIN {
  // Identity
  ASIN: string | null;
  SKU: string | null;
  ClientIDCode: string | null;
  Marketplace: string | null;
  Country: string | null;
  BrandName: string | null;
  Status: string | null;
  SummarizedTitle: string | null;

  // URLs
  AmazonPDPURL: string | null;
  WebsitePDPURL: string | null;

  // Variation structure
  VariationID: string | null;
  VariationProduct: string | null;
  ParentageLevel: string | null;
  ChildRelationshipType: string | null;
  ParentSKU: string | null;
  ParentASIN: string | null;
  VariationThemeName: string | null;
  Flavor: string | null;
  Style: string | null;
  Color: string | null;
  Size: string | null;

  // Product classification
  ProductType: string | null;
  ItemTypeKeyword: string | null;
  ProductCategory: string | null;
  ProductSubcategory: string | null;

  // Existing SEO content (baseline)
  ItemName: string | null;
  DetailedBulletPoint1: string | null;
  DetailedBulletPoint2: string | null;
  DetailedBulletPoint3: string | null;
  DetailedBulletPoint4: string | null;
  DetailedBulletPoint5: string | null;
  ProductDescription: string | null;
  GenericKeyword1: string | null;
  GenericKeyword2: string | null;
  GenericKeyword3: string | null;
  GenericKeyword4: string | null;
  GenericKeyword5: string | null;
  ConciseBulletPoint1: string | null;
  ConciseBulletPoint2: string | null;
  ConciseBulletPoint3: string | null;
  ConciseBulletPoint4: string | null;
  ConciseBulletPoint5: string | null;
  PA_LIBulletPoint1: string | null;
  PA_LIBulletPoint2: string | null;
  PA_LIBulletPoint3: string | null;
  PA_LIBulletPoint4: string | null;
  PA_LIBulletPoint5: string | null;
  KeyFeature1: string | null;
  KeyFeature2: string | null;
  KeyFeature3: string | null;
  KeyFeature4: string | null;
  KeyFeature5: string | null;

  // Additional product attributes (for Rufus/COSMO enrichment)
  TargetAudience1: string | null;
  TargetAudience2: string | null;
  TargetAudience3: string | null;
  TargetAudience4: string | null;
  TargetAudience5: string | null;
  RecommendedUsesForProduct1: string | null;
  RecommendedUsesForProduct2: string | null;
  RecommendedUsesForProduct3: string | null;
  RecommendedUsesForProduct4: string | null;
  RecommendedUsesForProduct5: string | null;
  SpecificUsesforProduct1: string | null;
  SpecificUsesforProduct2: string | null;
  SpecificUsesforProduct3: string | null;
  SpecificUsesforProduct4: string | null;
  SpecificUsesforProduct5: string | null;
  DietType1: string | null;
  DietType2: string | null;
  DietType3: string | null;
  DietType4: string | null;
  DietType5: string | null;
  Ingredients1: string | null;
  Ingredients2: string | null;
  Ingredients3: string | null;
  Ingredients4: string | null;
  Ingredients5: string | null;
  ProductBenefits1: string | null;
  ProductBenefits2: string | null;
  ProductBenefits3: string | null;
  ProductBenefits4: string | null;
  ProductBenefits5: string | null;
  SpecialFeatures1: string | null;
  SpecialFeatures2: string | null;
  SpecialFeatures3: string | null;
  SpecialFeatures4: string | null;
  SpecialFeatures5: string | null;
  ItemForm1: string | null;
  FormFactor: string | null;
  UnitCount: string | null;
  UnitCountType: string | null;
  ListPrice: string | null;
  Manufacturer: string | null;
}

// ─── Filter types ────────────────────────────────────────

export interface ClientFilters {
  clientName?: string;
  brandName?: string;
  marketplace?: string;
  country?: string;
  clientStatus?: string;
  clientIDCode?: string;
}

export interface ASINFilters {
  clientIDCode: string; // required — links to AAC
  parentageLevel?: string;
  variationThemeName?: string;
  variationID?: string;
  productCategory?: string;
  productSubcategory?: string;
  flavor?: string;
  style?: string;
  color?: string;
  size?: string;
  status?: string;
  searchTerm?: string; // searches ASIN, SKU, SummarizedTitle
  limit?: number;
  offset?: number;
}

export interface ASINFilterOptions {
  parentageLevels: string[];
  variationThemeNames: string[];
  variationIDs: string[];
  productCategories: string[];
  productSubcategories: string[];
  flavors: string[];
  styles: string[];
  colors: string[];
  sizes: string[];
  statuses: string[];
  totalCount: number;
}

// ─── Query helpers ───────────────────────────────────────

/**
 * Fetch clients from AAC table with optional filters
 */
export async function fetchClients(
  filters: ClientFilters = {}
): Promise<AACClient[]> {
  const client = getClient();
  const conditions: string[] = [];
  const params: Record<string, string> = {};

  // Select only the columns we need for S1 metadata
  const columns = [
    "ClientStatus",
    "ClientName",
    "ClientIDCode",
    "BrandName",
    "Marketplace",
    "Country",
    "Tier",
    "BrandURL",
    "ClientBibleURL",
    "ClientBibleID",
    "Competitor1Name",
    "Competitor1URL",
    "Competitor2Name",
    "Competitor2URL",
    "Competitor3Name",
    "Competitor3URL",
    "Competitor4Name",
    "Competitor4URL",
    "Competitor5Name",
    "Competitor5URL",
  ].join(", ");

  if (filters.clientName) {
    conditions.push("LOWER(ClientName) LIKE LOWER(@clientName)");
    params.clientName = `%${filters.clientName}%`;
  }
  if (filters.brandName) {
    conditions.push("LOWER(BrandName) LIKE LOWER(@brandName)");
    params.brandName = `%${filters.brandName}%`;
  }
  if (filters.marketplace) {
    conditions.push("Marketplace = @marketplace");
    params.marketplace = filters.marketplace;
  }
  if (filters.country) {
    conditions.push("Country = @country");
    params.country = filters.country;
  }
  if (filters.clientStatus) {
    conditions.push("ClientStatus = @clientStatus");
    params.clientStatus = filters.clientStatus;
  }
  if (filters.clientIDCode) {
    conditions.push("ClientIDCode = @clientIDCode");
    params.clientIDCode = filters.clientIDCode;
  }

  // Always filter by Active status unless explicitly overridden
  if (!filters.clientStatus) {
    conditions.push("ClientStatus = 'Active'");
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `SELECT ${columns} FROM \`${AAC_TABLE}\` ${where} ORDER BY Tier ASC, BrandName ASC LIMIT 200`;

  const [rows] = await client.query({ query, params });
  return rows as AACClient[];
}

/**
 * Fetch distinct filter options for ASINs belonging to a client
 */
export async function fetchASINFilterOptions(
  clientIDCode: string
): Promise<ASINFilterOptions> {
  const client = getClient();

  const query = `
    SELECT
      ARRAY_AGG(DISTINCT ParentageLevel IGNORE NULLS) AS parentageLevels,
      ARRAY_AGG(DISTINCT VariationThemeName IGNORE NULLS) AS variationThemeNames,
      ARRAY_AGG(DISTINCT VariationID IGNORE NULLS) AS variationIDs,
      ARRAY_AGG(DISTINCT ProductCategory IGNORE NULLS) AS productCategories,
      ARRAY_AGG(DISTINCT ProductSubcategory IGNORE NULLS) AS productSubcategories,
      ARRAY_AGG(DISTINCT Flavor IGNORE NULLS) AS flavors,
      ARRAY_AGG(DISTINCT Style IGNORE NULLS) AS styles,
      ARRAY_AGG(DISTINCT Color IGNORE NULLS) AS colors,
      ARRAY_AGG(DISTINCT Size IGNORE NULLS) AS sizes,
      ARRAY_AGG(DISTINCT Status IGNORE NULLS) AS statuses,
      COUNT(*) AS totalCount
    FROM \`${BIBLE_TABLE}\`
    WHERE ClientIDCode = @clientIDCode
  `;

  const [rows] = await client.query({
    query,
    params: { clientIDCode },
  });

  const row = rows[0] || {};
  
  // Debug: log raw keys to find column name mismatches
  console.log("Filter query raw keys:", Object.keys(row));
  console.log("variationIDs value:", row.variationIDs);

  return {
    parentageLevels: (row.parentageLevels || []).filter(Boolean).sort(),
    variationThemeNames: (row.variationThemeNames || []).filter(Boolean).sort(),
    variationIDs: (row.variationIDs || row.variationids || []).filter(Boolean).sort(),
    productCategories: (row.productCategories || []).filter(Boolean).sort(),
    productSubcategories: (row.productSubcategories || []).filter(Boolean).sort(),
    flavors: (row.flavors || []).filter(Boolean).sort(),
    styles: (row.styles || []).filter(Boolean).sort(),
    colors: (row.colors || []).filter(Boolean).sort(),
    sizes: (row.sizes || []).filter(Boolean).sort(),
    statuses: (row.statuses || []).filter(Boolean).sort(),
    totalCount: Number(row.totalCount) || 0,
  };
}

/**
 * Fetch ASINs from Bible Master with filters + pagination
 */
export async function fetchASINs(
  filters: ASINFilters
): Promise<{ asins: BibleASIN[]; totalCount: number }> {
  const client = getClient();
  const conditions: string[] = ["ClientIDCode = @clientIDCode"];
  const params: Record<string, string | number> = {
    clientIDCode: filters.clientIDCode,
  };

  // Summary columns for the list view (not all 500+ fields)
  const listColumns = [
    "ASIN",
    "SKU",
    "SummarizedTitle",
    "ParentageLevel",
    "ParentASIN",
    "ParentSKU",
    "VariationID",
    "VariationProduct",
    "VariationThemeName",
    "ChildRelationshipType",
    "Flavor",
    "Style",
    "Color",
    "Size",
    "Status",
    "ProductCategory",
    "ProductSubcategory",
    "ItemName",
    "ListPrice",
  ].join(", ");

  if (filters.parentageLevel) {
    conditions.push("ParentageLevel = @parentageLevel");
    params.parentageLevel = filters.parentageLevel;
  }
  if (filters.variationThemeName) {
    conditions.push("VariationThemeName = @variationThemeName");
    params.variationThemeName = filters.variationThemeName;
  }
  if (filters.variationID) {
    conditions.push("VariationID = @variationID");
    params.variationID = filters.variationID;
  }
  if (filters.productCategory) {
    conditions.push("ProductCategory = @productCategory");
    params.productCategory = filters.productCategory;
  }
  if (filters.productSubcategory) {
    conditions.push("ProductSubcategory = @productSubcategory");
    params.productSubcategory = filters.productSubcategory;
  }
  if (filters.flavor) {
    conditions.push("Flavor = @flavor");
    params.flavor = filters.flavor;
  }
  if (filters.style) {
    conditions.push("Style = @style");
    params.style = filters.style;
  }
  if (filters.color) {
    conditions.push("Color = @color");
    params.color = filters.color;
  }
  if (filters.size) {
    conditions.push("Size = @size");
    params.size = filters.size;
  }
  if (filters.status) {
    conditions.push("Status = @status");
    params.status = filters.status;
  }
  if (filters.searchTerm) {
    conditions.push(
      "(LOWER(ASIN) LIKE LOWER(@search) OR LOWER(SKU) LIKE LOWER(@search) OR LOWER(SummarizedTitle) LIKE LOWER(@search))"
    );
    params.search = `%${filters.searchTerm}%`;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  // Get total count
  const countQuery = `SELECT COUNT(*) as total FROM \`${BIBLE_TABLE}\` ${where}`;
  const [countRows] = await client.query({ query: countQuery, params });
  const totalCount = Number(countRows[0]?.total) || 0;

  // Get paginated results
  const dataQuery = `SELECT ${listColumns} FROM \`${BIBLE_TABLE}\` ${where} ORDER BY ParentageLevel DESC, ASIN ASC LIMIT @limit OFFSET @offset`;
  params.limit = limit;
  params.offset = offset;

  const [dataRows] = await client.query({ query: dataQuery, params });

  return {
    asins: dataRows as BibleASIN[],
    totalCount,
  };
}

/**
 * Fetch full ASIN data for selected ASINs (all SEO-relevant columns)
 * Used after user confirms selection — pulls complete data for S1 pipeline
 */
export async function fetchFullASINData(
  asins: string[],
  clientIDCode: string
): Promise<BibleASIN[]> {
  const client = getClient();

  if (asins.length === 0) return [];

  // All columns needed for S1 baseline + downstream phases
  const fullColumns = [
    // Identity & structure
    "ASIN", "SKU", "ClientIDCode", "Marketplace", "Country", "BrandName",
    "Status", "SummarizedTitle", "AmazonPDPURL", "WebsitePDPURL",
    "ProductType", "ItemTypeKeyword", "ProductCategory", "ProductSubcategory",

    // Variation
    "VariationID", "VariationProduct", "ParentageLevel",
    "ChildRelationshipType", "ParentSKU", "ParentASIN",
    "VariationThemeName", "Flavor", "Style", "Color", "Size",

    // Existing SEO content (baseline analysis)
    "ItemName",
    "DetailedBulletPoint1", "DetailedBulletPoint2", "DetailedBulletPoint3",
    "DetailedBulletPoint4", "DetailedBulletPoint5",
    "ProductDescription",
    "GenericKeyword1", "GenericKeyword2", "GenericKeyword3",
    "GenericKeyword4", "GenericKeyword5",
    "ConciseBulletPoint1", "ConciseBulletPoint2", "ConciseBulletPoint3",
    "ConciseBulletPoint4", "ConciseBulletPoint5",
    "PA_LIBulletPoint1", "PA_LIBulletPoint2", "PA_LIBulletPoint3",
    "PA_LIBulletPoint4", "PA_LIBulletPoint5",
    "KeyFeature1", "KeyFeature2", "KeyFeature3",
    "KeyFeature4", "KeyFeature5",

    // Enrichment attributes for Rufus/COSMO
    "TargetAudience1", "TargetAudience2", "TargetAudience3",
    "TargetAudience4", "TargetAudience5",
    "RecommendedUsesForProduct1", "RecommendedUsesForProduct2",
    "RecommendedUsesForProduct3", "RecommendedUsesForProduct4",
    "RecommendedUsesForProduct5",
    "SpecificUsesforProduct1", "SpecificUsesforProduct2",
    "SpecificUsesforProduct3", "SpecificUsesforProduct4",
    "SpecificUsesforProduct5",
    "DietType1", "DietType2", "DietType3", "DietType4", "DietType5",
    "Ingredients1", "Ingredients2", "Ingredients3",
    "Ingredients4", "Ingredients5",
    "ProductBenefits1", "ProductBenefits2", "ProductBenefits3",
    "ProductBenefits4", "ProductBenefits5",
    "SpecialFeatures1", "SpecialFeatures2", "SpecialFeatures3",
    "SpecialFeatures4", "SpecialFeatures5",
    "ItemForm1", "FormFactor", "UnitCount", "UnitCountType",
    "ListPrice", "Manufacturer",
  ].join(", ");

  // Use parameterized IN clause
  const placeholders = asins.map((_, i) => `@asin_${i}`).join(", ");
  const params: Record<string, string> = { clientIDCode };
  asins.forEach((asin, i) => {
    params[`asin_${i}`] = asin;
  });

  const query = `
    SELECT ${fullColumns}
    FROM \`${BIBLE_TABLE}\`
    WHERE ClientIDCode = @clientIDCode AND ASIN IN (${placeholders})
    ORDER BY ParentageLevel DESC, ASIN ASC
  `;

  const [rows] = await client.query({ query, params });
  return rows as BibleASIN[];
}
