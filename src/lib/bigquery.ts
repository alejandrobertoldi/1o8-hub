/* eslint-disable react-doctor/async-await-in-loop */
/**
 * BigQuery client and publish functionality.
 *
 * Matches the existing cloud function behavior:
 * - All columns are STRING type
 * - Uses WRITE_TRUNCATE (full table replace)
 * - Target: ${GCP_PROJECT_ID}.${BQ_DATASET}.${BQ_TABLE} (env-driven; default mfhub-501815.1o8 Hub.Master)
 */
import { BigQuery, type TableField } from "@google-cloud/bigquery";
import { db } from "./db";
import { master } from "./db/schema";
import { mapProductToBqRow, type BqRow } from "./product-mapper";
import { eq } from "drizzle-orm";
import { Readable } from "stream";

/** Sanitize column name for BigQuery: replace spaces/special chars with underscores */
function bqSafe(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}

/** Sanitize all keys in a BqRow map */
function sanitizeRow(row: BqRow): BqRow {
  const out: BqRow = {};
  for (const [k, v] of Object.entries(row)) {
    const safe = bqSafe(k);
    if (safe) out[safe] = v;
  }
  return out;
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8 Hub";
const TABLE = process.env.BQ_TABLE || "Master";
const STAGING_TABLE = `${TABLE}_Staging`;
const FULL_TABLE = `${PROJECT_ID}.${DATASET}.${TABLE}`;
const FULL_STAGING_TABLE = `${PROJECT_ID}.${DATASET}.${STAGING_TABLE}`;

/**
 * SEO content versions (ASIN+SKU × SEOVersionNumber × SEOCategory) live in the
 * Bible app's dataset, not 1o8 Hub — `1o8 Hub.SEO` has never existed in prod, so
 * every read of it 404'd (verified 2026-09-23). Reads only: the version-0
 * insert below still targets 1o8 Hub and is deliberately left alone until the
 * owner of MFBibleApp.SEO agrees to Hub writes there.
 */
export const SEO_VERSIONS_DATASET = process.env.BQ_SEO_DATASET || "MFBibleApp";
export const SEO_VERSIONS_READ_TABLE = `${PROJECT_ID}.${SEO_VERSIONS_DATASET}.SEO`;

export function getBigQueryClient(): BigQuery {
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    // Handle private key format: Vercel may store with literal \n or real newlines
    let privateKey = process.env.GCP_PRIVATE_KEY;
    // Replace literal \n (escaped) with real newlines
    privateKey = privateKey.replace(/\\n/g, "\n");
    // If the key was JSON-stringified (wrapped in extra quotes), unwrap it
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = JSON.parse(privateKey);
    }

    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

// ─── SEO type interfaces (used by /api/seo/bq/* PostgreSQL routes) ──

export interface AACClient {
  ClientStatus: string | null;
  ClientName: string | null;
  ClientIDCode: string | null;
  BrandName: string | null;
  Marketplace: string | null;
  Country: string | null;
  Tier: number | null;
  BrandURL: string | null;
  Competitor1Name: string | null; Competitor1URL: string | null;
  Competitor2Name: string | null; Competitor2URL: string | null;
  Competitor3Name: string | null; Competitor3URL: string | null;
  Competitor4Name: string | null; Competitor4URL: string | null;
  Competitor5Name: string | null; Competitor5URL: string | null;
}

export interface HubASIN {
  ASIN: string | null; SKU: string | null; ClientIDCode: string | null;
  Marketplace: string | null; Country: string | null; BrandName: string | null;
  Status: string | null; SummarizedTitle: string | null;
  AmazonPDPURL: string | null; WebsitePDPURL: string | null;
  VariationID: string | null; VariationProduct: string | null;
  ParentageLevel: string | null; ChildRelationshipType: string | null;
  ParentSKU: string | null; ParentASIN: string | null;
  VariationThemeName: string | null; Flavor: string | null;
  Style: string | null; Color: string | null; Size: string | null;
  ProductType: string | null; ItemTypeKeyword: string | null;
  ProductCategory: string | null; ProductSubcategory: string | null;
  ItemName: string | null;
  DetailedBulletPoint1: string | null; DetailedBulletPoint2: string | null;
  DetailedBulletPoint3: string | null; DetailedBulletPoint4: string | null;
  DetailedBulletPoint5: string | null; ProductDescription: string | null;
  GenericKeyword1: string | null; GenericKeyword2: string | null;
  GenericKeyword3: string | null; GenericKeyword4: string | null;
  GenericKeyword5: string | null;
  ConciseBulletPoint1: string | null; ConciseBulletPoint2: string | null;
  ConciseBulletPoint3: string | null; ConciseBulletPoint4: string | null;
  ConciseBulletPoint5: string | null;
  PA_LIBulletPoint1: string | null; PA_LIBulletPoint2: string | null;
  PA_LIBulletPoint3: string | null; PA_LIBulletPoint4: string | null;
  PA_LIBulletPoint5: string | null;
  KeyFeature1: string | null; KeyFeature2: string | null;
  KeyFeature3: string | null; KeyFeature4: string | null;
  KeyFeature5: string | null;
  TargetAudience1: string | null; TargetAudience2: string | null;
  TargetAudience3: string | null; TargetAudience4: string | null;
  TargetAudience5: string | null;
  RecommendedUsesForProduct1: string | null; RecommendedUsesForProduct2: string | null;
  RecommendedUsesForProduct3: string | null; RecommendedUsesForProduct4: string | null;
  RecommendedUsesForProduct5: string | null;
  SpecificUsesforProduct1: string | null; SpecificUsesforProduct2: string | null;
  SpecificUsesforProduct3: string | null; SpecificUsesforProduct4: string | null;
  SpecificUsesforProduct5: string | null;
  DietType1: string | null; DietType2: string | null; DietType3: string | null;
  DietType4: string | null; DietType5: string | null;
  Ingredients1: string | null; Ingredients2: string | null;
  Ingredients3: string | null; Ingredients4: string | null;
  Ingredients5: string | null;
  ProductBenefits1: string | null; ProductBenefits2: string | null;
  ProductBenefits3: string | null; ProductBenefits4: string | null;
  ProductBenefits5: string | null;
  SpecialFeatures1: string | null; SpecialFeatures2: string | null;
  SpecialFeatures3: string | null; SpecialFeatures4: string | null;
  SpecialFeatures5: string | null;
  ItemForm1: string | null; FormFactor: string | null;
  UnitCount: string | null; UnitCountType: string | null;
  ListPrice: string | null; Manufacturer: string | null;
}

/**
 * Publish all products to BigQuery.
 *
 * 1. Reads all products from PostgreSQL
 * 2. Maps each to a flat BQ row (all 972 STRING columns)
 * 3. Loads into BigQuery with WRITE_TRUNCATE (full replace)
 * 4. Resets is_dirty and updates last_published_at
 */
export async function publishToBigQuery(): Promise<{
  rowsPublished: number;
  jobId: string;
}> {
  const bigquery = getBigQueryClient();

  // 1. Read all products
  const allProducts = await db.select().from(master);

  if (allProducts.length === 0) {
    throw new Error("No products to publish");
  }

  // 2. Map to flat BQ rows (sanitize keys for BigQuery compatibility)
  const bqRows: BqRow[] = allProducts.map((p) => sanitizeRow(mapProductToBqRow(p)));

  // 3. Build schema from the keys of all rows (all STRING)
  const allKeys = new Set<string>();
  for (const row of bqRows) {
    for (const key of Object.keys(row)) {
      if (key.trim()) allKeys.add(key);
    }
  }

  const schemaFields: TableField[] = Array.from(allKeys).map((name) => ({
    name,
    type: "STRING",
  }));

  // Ensure all rows have all keys
  const normalizedRows = bqRows.map((row) => {
    const normalized: BqRow = {};
    for (const key of allKeys) {
      normalized[key] = row[key] ?? "";
    }
    return normalized;
  });

  // 4. Load into BigQuery with WRITE_TRUNCATE
  // Create NDJSON stream and pipe to BigQuery via createWriteStream
  const table = bigquery.dataset(DATASET).table(TABLE);
  const ndjson = normalizedRows.map((r) => JSON.stringify(r)).join("\n");
  const stream = Readable.from([ndjson]);

  const writeStream = table.createWriteStream({
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    writeDisposition: "WRITE_TRUNCATE",
    schema: { fields: schemaFields },
  });

  const jobId = await new Promise<string>((resolve, reject) => {
    stream
      .pipe(writeStream)
      .on("complete", (job) => {
        resolve(job.id ?? "unknown");
      })
      .on("error", (err) => {
        reject(err);
      });
  });

  // 5. Reset dirty flags
  const now = new Date();
  await db
    .update(master)
    .set({
      isDirty: false,
      lastPublishedAt: now,
      updatedAt: now,
    })
    .where(eq(master.isDirty, true));

  return {
    rowsPublished: allProducts.length,
    jobId,
  };
}

/**
 * Publish only dirty products to BigQuery using a staging table + MERGE.
 *
 * 1. Reads dirty products from PostgreSQL
 * 2. Maps them to flat BQ rows
 * 3. Loads into a staging table with WRITE_TRUNCATE
 * 4. Runs a MERGE query to update/insert into the main table
 * 5. Resets is_dirty and updates last_published_at on published products
 */
export async function publishDirtyToBigQuery(): Promise<{
  rowsPublished: number;
  jobId: string;
}> {
  const bigquery = getBigQueryClient();

  // 1. Read only dirty products
  const dirtyProducts = await db
    .select()
    .from(master)
    .where(eq(master.isDirty, true));

  if (dirtyProducts.length === 0) {
    throw new Error("No dirty products to publish");
  }

  // 2. Map to flat BQ rows (sanitize keys for BigQuery compatibility)
  const bqRows: BqRow[] = dirtyProducts.map((p) => sanitizeRow(mapProductToBqRow(p)));

  // 3. Build schema from row keys (all STRING)
  const allKeys = new Set<string>();
  for (const row of bqRows) {
    for (const key of Object.keys(row)) {
      if (key.trim()) allKeys.add(key);
    }
  }

  const schemaFields: TableField[] = Array.from(allKeys).map((name) => ({
    name,
    type: "STRING",
  }));

  // Normalize rows so all have the same keys
  const normalizedRows = bqRows.map((row) => {
    const normalized: BqRow = {};
    for (const key of allKeys) {
      normalized[key] = row[key] ?? "";
    }
    return normalized;
  });

  // 4. Load dirty rows into staging table with WRITE_TRUNCATE
  const stagingTable = bigquery.dataset(DATASET).table(STAGING_TABLE);
  const ndjson = normalizedRows.map((r) => JSON.stringify(r)).join("\n");
  const stream = Readable.from([ndjson]);

  const writeStream = stagingTable.createWriteStream({
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    writeDisposition: "WRITE_TRUNCATE",
    schema: { fields: schemaFields },
  });

  const loadJobId = await new Promise<string>((resolve, reject) => {
    stream
      .pipe(writeStream)
      .on("complete", (job) => {
        resolve(job.id ?? "unknown");
      })
      .on("error", (err) => {
        reject(err);
      });
  });

  // 5. Build and run MERGE query
  const columnNames = Array.from(allKeys);
  const updateClauses = columnNames
    .map((col) => `T.\`${col}\` = S.\`${col}\``)
    .join(", ");
  const insertColumns = columnNames.map((col) => `\`${col}\``).join(", ");
  const insertValues = columnNames
    .map((col) => `S.\`${col}\``)
    .join(", ");

  const mergeQuery = `
    MERGE \`${FULL_TABLE}\` T
    USING \`${FULL_STAGING_TABLE}\` S
    ON T.SKU = S.SKU
    WHEN MATCHED THEN
      UPDATE SET ${updateClauses}
    WHEN NOT MATCHED THEN
      INSERT (${insertColumns})
      VALUES (${insertValues})
  `;

  const [mergeJob] = await bigquery.createQueryJob({ query: mergeQuery });
  await mergeJob.getQueryResults();
  const mergeJobId = mergeJob.id ?? loadJobId;

  // 6. Clean up staging table
  try {
    await bigquery
      .dataset(DATASET)
      .table(STAGING_TABLE)
      .delete();
  } catch {
    // Non-critical — staging table cleanup failure shouldn't fail publish
    console.warn("Failed to delete staging table, will be overwritten next time");
  }

  // 7. Reset dirty flags on published products
  const now = new Date();
  const dirtyIds = dirtyProducts.map((p) => p.id);
  for (const id of dirtyIds) {
    await db
      .update(master)
      .set({
        isDirty: false,
        lastPublishedAt: now,
        updatedAt: now,
      })
      .where(eq(master.id, id));
  }

  return {
    rowsPublished: dirtyProducts.length,
    jobId: mergeJobId,
  };
}

/**
 * Run a parameterized SELECT query against BigQuery and return typed rows.
 */
export async function queryBigQuery<T = Record<string, string>>(
  sqlQuery: string,
  params?: Record<string, string | string[]>
): Promise<T[]> {
  const bigquery = getBigQueryClient();
  const [job] = await bigquery.createQueryJob({
    query: sqlQuery,
    params,
  });
  const [rows] = await job.getQueryResults();
  return rows as T[];
}

const AAC_TABLE = `${PROJECT_ID}.${DATASET}.AAC`;

/**
 * Update a single field in the BQ AAC table for a given ClientIDCode.
 * Uses DML UPDATE so only the specific cell is changed.
 */
export async function updateAacFieldInBigQuery(
  clientIdCode: string,
  field: string,
  value: string
): Promise<void> {
  const bigquery = getBigQueryClient();

  // Get the column type so we can cast correctly
  const [metadata] = await bigquery.dataset(DATASET).table("AAC").getMetadata();
  const col = metadata.schema?.fields?.find(
    (f: { name: string }) => f.name === field
  );
  const colType = col?.type?.toUpperCase() ?? "STRING";

  let setExpr: string;
  if (value === "" || value == null) {
    setExpr = `\`${field}\` = NULL`;
  } else if (colType === "FLOAT64" || colType === "FLOAT" || colType === "NUMERIC" || colType === "BIGNUMERIC" || colType === "INT64" || colType === "INTEGER") {
    // BQ metadata returns FLOAT/INTEGER but SQL needs FLOAT64/INT64
    const sqlType = colType === "FLOAT" ? "FLOAT64" : colType === "INTEGER" ? "INT64" : colType;
    setExpr = `\`${field}\` = SAFE_CAST(@value AS ${sqlType})`;
  } else if (colType === "BOOL" || colType === "BOOLEAN") {
    setExpr = `\`${field}\` = SAFE_CAST(@value AS BOOL)`;
  } else if (colType === "DATE") {
    setExpr = `\`${field}\` = SAFE_CAST(@value AS DATE)`;
  } else if (colType === "TIMESTAMP" || colType === "DATETIME") {
    setExpr = `\`${field}\` = SAFE_CAST(@value AS ${colType})`;
  } else {
    setExpr = `\`${field}\` = @value`;
  }

  const query = `UPDATE \`${AAC_TABLE}\` SET ${setExpr} WHERE ClientIDCode = @clientIdCode`;
  const [job] = await bigquery.createQueryJob({
    query,
    params: { value, clientIdCode },
  });
  await job.getQueryResults();
}

/**
 * Insert a new client row into the SEO AAC BigQuery table.
 * Called when a client is registered via the Hub so it appears in the SEO manager.
 */
export async function insertClientToBigQuery(
  clientIdCode: string,
  clientName: string,
  clientStatus: string = "Active"
): Promise<void> {
  const bigquery = getBigQueryClient();
  const query = `
    INSERT INTO \`${AAC_TABLE}\` (ClientIDCode, ClientName, ClientStatus)
    VALUES (@clientIdCode, @clientName, @clientStatus)
  `;
  const [job] = await bigquery.createQueryJob({
    query,
    params: { clientIdCode, clientName, clientStatus },
  });
  await job.getQueryResults();
}

/**
 * Fetch all SEO versions for a given ASIN + SKU from the BQ SEO table.
 */
export async function getSeoVersions(
  asin: string,
  sku: string
): Promise<BqRow[]> {
  const sql = `
    SELECT *
    FROM \`${SEO_VERSIONS_READ_TABLE}\`
    WHERE ASIN = @asin AND SKU = @sku
    ORDER BY SEOVersionNumber
  `;
  return queryBigQuery<BqRow>(sql, { asin, sku });
}

/**
 * Every SEO version (V00 inherited CLR copy, V01+ ours) for a set of ASINs,
 * with the listing-copy columns. Read-only. Callers match SKU themselves —
 * a listing's versions are keyed ASIN+SKU.
 */
export async function getSeoVersionsForAsins(asins: string[]): Promise<BqRow[]> {
  const unique = [...new Set(asins.filter(Boolean))];
  if (unique.length === 0) return [];
  const sql = `
    SELECT ASIN, SKU, CAST(SEOVersionNumber AS STRING) AS SEOVersionNumber, SEOCategory, SEOStatus,
      ItemName, ProductDescription,
      DetailedBulletPoint1, DetailedBulletPoint2, DetailedBulletPoint3, DetailedBulletPoint4, DetailedBulletPoint5,
      GenericKeyword1, GenericKeyword2, GenericKeyword3, GenericKeyword4, GenericKeyword5
    FROM \`${SEO_VERSIONS_READ_TABLE}\`
    WHERE ASIN IN UNNEST(@asins)
  `;
  return queryBigQuery<BqRow>(sql, { asins: unique });
}

/**
 * Fetch a specific SEO version row from BQ.
 */
export async function getSeoVersion(
  asin: string,
  sku: string,
  seoVersionNumber: string,
  seoCategory: string
): Promise<BqRow | null> {
  const version = String(seoVersionNumber).trim();
  const isInherited = version === "0";
  // CAST: SEOVersionNumber may be INT64 or STRING in BQ. Version 0 is the
  // CLR inherited row and may not use category "Inherited" on older rows.
  const sql = isInherited
    ? `
    SELECT *
    FROM \`${SEO_VERSIONS_READ_TABLE}\`
    WHERE ASIN = @asin AND SKU = @sku
      AND CAST(SEOVersionNumber AS STRING) = @seoVersionNumber
    ORDER BY CASE WHEN SEOCategory = @seoCategory THEN 0 ELSE 1 END
    LIMIT 1
  `
    : `
    SELECT *
    FROM \`${SEO_VERSIONS_READ_TABLE}\`
    WHERE ASIN = @asin AND SKU = @sku
      AND CAST(SEOVersionNumber AS STRING) = @seoVersionNumber
      AND SEOCategory = @seoCategory
    LIMIT 1
  `;
  const rows = await queryBigQuery<BqRow>(sql, {
    asin,
    sku,
    seoVersionNumber: version,
    seoCategory,
  });
  return rows[0] ?? null;
}

/**
 * Get publish info (count of dirty master).
 */
export async function getPublishInfo(): Promise<{
  totalProducts: number;
  dirtyProducts: number;
}> {
  const allProducts = await db
    .select({ id: master.id, isDirty: master.isDirty })
    .from(master);
  const dirtyCount = allProducts.filter((p) => p.isDirty).length;
  return {
    totalProducts: allProducts.length,
    dirtyProducts: dirtyCount,
  };
}

export type InheritedSeoVersionRow = {
  ASIN: string;
  SKU: string;
  ClientIDCode: string;
  Marketplace: string;
  Country?: string;
  ItemName?: string;
  ProductDescription?: string;
  DetailedBulletPoint1?: string;
  DetailedBulletPoint2?: string;
  DetailedBulletPoint3?: string;
  DetailedBulletPoint4?: string;
  DetailedBulletPoint5?: string;
  GenericKeyword1?: string;
  GenericKeyword2?: string;
  GenericKeyword3?: string;
  GenericKeyword4?: string;
  GenericKeyword5?: string;
};

const SEO_TABLE = `${PROJECT_ID}.${DATASET}.SEO`;

/**
 * Insert inherited onboarding copy as SEO version 0.
 * Existing version-0 rows for the same ASIN+SKU are left unchanged.
 */
export async function insertInheritedSeoVersions(
  rows: InheritedSeoVersionRow[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const bigquery = getBigQueryClient();
  const skus = [...new Set(rows.map((row) => row.SKU).filter(Boolean))];
  const existingKeys = new Set<string>();
  if (skus.length > 0) {
    const [job] = await bigquery.createQueryJob({
      query: `
        SELECT ASIN, SKU
        FROM \`${SEO_TABLE}\`
        WHERE CAST(SEOVersionNumber AS STRING) = '0'
          AND SKU IN UNNEST(@skus)
      `,
      params: { skus },
    });
    const [found] = await job.getQueryResults();
    for (const row of found as Array<{ ASIN?: string; SKU?: string }>) {
      if (!row.SKU) continue;
      existingKeys.add(
        `${String(row.ASIN ?? "").toUpperCase()}\0${row.SKU}`
      );
    }
  }

  const toInsert = rows.filter(
    (row) => !existingKeys.has(`${row.ASIN.toUpperCase()}\0${row.SKU}`)
  );
  if (toInsert.length === 0) return 0;

  await bigquery.dataset(DATASET).table("SEO").insert(
    toInsert.map((row) => ({
      ASIN: row.ASIN,
      SKU: row.SKU,
      ClientIDCode: row.ClientIDCode,
      Marketplace: row.Marketplace,
      Country: row.Country ?? "",
      SEOVersionNumber: "0",
      SEOCategory: "Inherited",
      SEOStatus: "Onboarding",
      ItemName: row.ItemName ?? "",
      ProductDescription: row.ProductDescription ?? "",
      DetailedBulletPoint1: row.DetailedBulletPoint1 ?? "",
      DetailedBulletPoint2: row.DetailedBulletPoint2 ?? "",
      DetailedBulletPoint3: row.DetailedBulletPoint3 ?? "",
      DetailedBulletPoint4: row.DetailedBulletPoint4 ?? "",
      DetailedBulletPoint5: row.DetailedBulletPoint5 ?? "",
      GenericKeyword1: row.GenericKeyword1 ?? "",
      GenericKeyword2: row.GenericKeyword2 ?? "",
      GenericKeyword3: row.GenericKeyword3 ?? "",
      GenericKeyword4: row.GenericKeyword4 ?? "",
      GenericKeyword5: row.GenericKeyword5 ?? "",
    }))
  );
  return toInsert.length;
}
