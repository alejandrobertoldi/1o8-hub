/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Pre-publish risk check before mirroring PG → BQ via WRITE_TRUNCATE.
 *
 * Check 1: Do the 64 BQ-only columns hold real data in BQ?
 *          (If yes, a full publish would erase that data.)
 * Check 2: Do the 4 only-in-BQ rows (with trailing-space marketplace)
 *          correspond to existing PG rows once the marketplace is trimmed?
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import { db } from "../src/lib/db";
import { mapProductToBqRow } from "../src/lib/product-mapper";
import type { Product } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

function bqSafe(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8Hub";
const TABLE = process.env.BQ_TABLE || "Master";
const FQTN = `${PROJECT_ID}.${DATASET}.${TABLE}`;

function getBigQueryClient(): BigQuery {
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    let pk = process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n");
    if (pk.startsWith('"') && pk.endsWith('"')) pk = JSON.parse(pk);
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: { client_email: process.env.GCP_CLIENT_EMAIL, private_key: pk },
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

async function main() {
  const bq = getBigQueryClient();

  // ── Step 0: compute BQ-only columns dynamically ──────────────────────
  console.log("→ Pulling BQ schema...");
  const [bqColRows] = await bq.query({
    query: `SELECT column_name FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`,
    params: { t: TABLE },
  });
  const bqColumns = new Set<string>(
    (bqColRows as { column_name: string }[]).map((r) => r.column_name)
  );

  console.log("→ Computing PG → BQ column projection...");
  const pgFullRows = (await db.execute(
    sql`SELECT id, asin, sku, client_id_code, marketplace, country, status,
                parentage_level, parent_sku, parent_asin,
                brand_name, item_name, summarized_title, product_type,
                list_price, cost_price, main_image_url,
                item_type_keyword, feed_product_type, recommended_browse_nodes,
                generic_keywords, platinum_keywords, variation_group,
                variation_ref, group_ref,
                content_seo, variations, packaging, target_audience, fulfillment,
                product_attributes, nutrition_supplements, compliance_safety,
                images, dimensions_weight, other_attributes, raw_column_values,
                is_dirty, change_log, updated_at, last_published_at, created_at
         FROM "master"`
  )) as unknown as Record<string, unknown>[];

  const pgColumns = new Set<string>();
  for (const r of pgFullRows) {
    const product = {
      id: r.id, asin: r.asin, sku: r.sku, clientIdCode: r.client_id_code,
      marketplace: r.marketplace, country: r.country, status: r.status,
      parentageLevel: r.parentage_level, parentSku: r.parent_sku,
      parentAsin: r.parent_asin, childRelationshipType: null,
      brandName: r.brand_name, itemName: r.item_name,
      summarizedTitle: r.summarized_title, productType: r.product_type,
      listPrice: r.list_price, costPrice: r.cost_price,
      mainImageUrl: r.main_image_url, itemTypeKeyword: r.item_type_keyword,
      feedProductType: r.feed_product_type,
      recommendedBrowseNodes: r.recommended_browse_nodes,
      genericKeywords: r.generic_keywords, platinumKeywords: r.platinum_keywords,
      variationGroup: r.variation_group, variationRef: r.variation_ref,
      groupRef: r.group_ref, contentSeo: r.content_seo,
      variations: r.variations, packaging: r.packaging,
      targetAudience: r.target_audience, fulfillment: r.fulfillment,
      productAttributes: r.product_attributes,
      nutritionSupplements: r.nutrition_supplements,
      complianceSafety: r.compliance_safety, images: r.images,
      dimensionsWeight: r.dimensions_weight, otherAttributes: r.other_attributes,
      rawColumnValues: r.raw_column_values, isDirty: r.is_dirty,
      changeLog: r.change_log, updatedAt: r.updated_at,
      lastPublishedAt: r.last_published_at, createdAt: r.created_at,
    } as unknown as Product;
    for (const k of Object.keys(mapProductToBqRow(product))) {
      const safe = bqSafe(k);
      if (safe) pgColumns.add(safe);
    }
  }

  const bqOnlyCols = [...bqColumns].filter((c) => !pgColumns.has(c));
  console.log(`→ Found ${bqOnlyCols.length} BQ-only columns to check.`);

  // ── CHECK 1: non-null/non-empty counts in BQ-only columns ─────────────
  console.log(`→ Checking non-null counts for ${bqOnlyCols.length} BQ-only columns...`);
  const selectClauses = bqOnlyCols
    .map(
      (c) =>
        `SUM(CASE WHEN \`${c}\` IS NOT NULL AND \`${c}\` != '' THEN 1 ELSE 0 END) AS \`${c}\``
    )
    .join(", ");
  const [countsRows] = await bq.query({
    query: `SELECT ${selectClauses} FROM \`${FQTN}\``,
  });
  const counts = countsRows[0] as Record<string, number>;

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("CHECK 1 — Non-empty values in BQ-only columns");
  console.log("══════════════════════════════════════════════════════════════════");
  let anyData = false;
  for (const col of bqOnlyCols) {
    const n = Number(counts[col] ?? 0);
    const flag = n > 0 ? "⚠️ DATA" : "  empty";
    if (n > 0) anyData = true;
    console.log(`  ${flag}  ${col.padEnd(50)} ${n}`);
  }
  if (!anyData) {
    console.log("\n  → All sampled BQ-only columns are empty. Safe to drop in WRITE_TRUNCATE.");
  } else {
    console.log("\n  → Some BQ-only columns hold real data. Investigate before WRITE_TRUNCATE.");
  }

  // ── CHECK 2: do the 4 trailing-space BQ rows match PG once trimmed? ───
  console.log("\n→ Checking the 4 only-in-BQ rows (trailing-space marketplace)...");
  const onlyInBq = [
    { sku: "TREJOS-TRTLLAWRMR-BLACK", asin: "B0CJYKZF9B", marketplace: "Amazon SC " },
    { sku: "HS-FS-1", asin: "B06XP296LV", marketplace: "Amazon SC " },
    { sku: "TREJOS-HOTHONEY-6CT", asin: "B0CWH7Y1LS", marketplace: "Amazon SC " },
    { sku: "Final-Parent", asin: "B0G91PHCL5", marketplace: "Amazon SC " },
  ];

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("CHECK 2 — Do the 4 only-in-BQ rows match a PG row when trimmed?");
  console.log("══════════════════════════════════════════════════════════════════");
  for (const r of onlyInBq) {
    const trimmedMkt = r.marketplace.trim();
    const matches = (await db.execute(
      sql`SELECT sku, asin, marketplace FROM "master"
          WHERE sku = ${r.sku} AND asin = ${r.asin} AND marketplace = ${trimmedMkt}`
    )) as unknown as { sku: string; asin: string; marketplace: string }[];
    const status = matches.length > 0 ? "✓ duplicate (trim mismatch)" : "✗ unique to BQ";
    console.log(
      `  ${status.padEnd(28)} ${r.sku.padEnd(28)} ${r.asin}  [BQ mkt="${r.marketplace}"]`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Risk check error:", err);
  process.exit(1);
});
