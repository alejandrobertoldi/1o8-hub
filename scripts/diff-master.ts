/**
 * Compare Supabase `master` table vs BigQuery `Master` table.
 *
 * Reports:
 *   - Row counts on each side
 *   - Identity tuples (SKU, ASIN, Marketplace) only-in-PG / only-in-BQ / shared
 *   - Schema columns: BQ-only / PG-only / shared (PG side = what publishToBigQuery would write)
 *   - PG dirty count (unpublished local edits)
 *
 * Usage: npx tsx scripts/diff-master.ts [--samples N]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import { db } from "../src/lib/db";
import { mapProductToBqRow } from "../src/lib/product-mapper";
import type { Product } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8Hub";
const TABLE = process.env.BQ_TABLE || "Master";
const FQTN = `${PROJECT_ID}.${DATASET}.${TABLE}`;

const samplesArgIdx = process.argv.indexOf("--samples");
const SAMPLE_COUNT =
  samplesArgIdx > -1 ? Math.max(1, parseInt(process.argv[samplesArgIdx + 1] ?? "5", 10)) : 5;

function bqSafe(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function diff<T>(a: Set<T>, b: Set<T>): T[] {
  return [...a].filter((x) => !b.has(x));
}

function getBigQueryClient(): BigQuery {
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    let privateKey = process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n");
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = JSON.parse(privateKey);
    }
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: { client_email: process.env.GCP_CLIENT_EMAIL, private_key: privateKey },
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

async function main() {
  console.log(`Comparing PG \`master\` ↔ BQ \`${FQTN}\`\n`);
  const bq = getBigQueryClient();

  // ── 1. BQ row count + schema ──────────────────────────────────────────
  console.log("→ Querying BigQuery row count + schema...");
  const [bqCountRows] = await bq.query({
    query: `SELECT COUNT(*) AS n FROM \`${FQTN}\``,
  });
  const bqCount = Number(bqCountRows[0]?.n ?? 0);

  const [bqColRows] = await bq.query({
    query: `SELECT column_name FROM \`${PROJECT_ID}.${DATASET}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @t`,
    params: { t: TABLE },
  });
  const bqColumns = new Set<string>(
    (bqColRows as { column_name: string }[]).map((r) => r.column_name)
  );

  // ── 2. PG row count + dirty count ─────────────────────────────────────
  console.log("→ Querying Postgres row count + dirty count...");
  const countResult = await db.execute(sql`SELECT COUNT(*)::int AS n FROM "master"`);
  const pgCount = Number((countResult as unknown as { n: number }[])[0]?.n ?? 0);

  const dirtyResult = await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM "master" WHERE is_dirty = true`
  );
  const dirtyCount = Number((dirtyResult as unknown as { n: number }[])[0]?.n ?? 0);

  // ── 3. Identity tuples on both sides ──────────────────────────────────
  console.log("→ Pulling (SKU, ASIN, Marketplace) tuples...");
  const [bqTuples] = await bq.query({
    query: `SELECT SKU, ASIN, Marketplace FROM \`${FQTN}\``,
  });
  const bqIds = new Set<string>();
  for (const r of bqTuples as { SKU?: string; ASIN?: string; Marketplace?: string }[]) {
    bqIds.add(`${r.SKU ?? ""}|${r.ASIN ?? ""}|${r.Marketplace ?? ""}`);
  }

  const pgIdRows = (await db.execute(
    sql`SELECT sku, asin, marketplace FROM "master"`
  )) as unknown as { sku: string | null; asin: string | null; marketplace: string | null }[];
  const pgIds = new Set<string>();
  for (const p of pgIdRows) {
    pgIds.add(`${p.sku ?? ""}|${p.asin ?? ""}|${p.marketplace ?? ""}`);
  }

  // ── 4. PG-side schema (what publishToBigQuery would write) ────────────
  // Pull only columns that actually exist in DB (skip schema-only columns)
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
    // Re-shape snake_case → camelCase to match Product type expected by mapper
    const product = {
      id: r.id,
      asin: r.asin,
      sku: r.sku,
      clientIdCode: r.client_id_code,
      marketplace: r.marketplace,
      country: r.country,
      status: r.status,
      parentageLevel: r.parentage_level,
      parentSku: r.parent_sku,
      parentAsin: r.parent_asin,
      childRelationshipType: null,
      brandName: r.brand_name,
      itemName: r.item_name,
      summarizedTitle: r.summarized_title,
      productType: r.product_type,
      listPrice: r.list_price,
      costPrice: r.cost_price,
      mainImageUrl: r.main_image_url,
      itemTypeKeyword: r.item_type_keyword,
      feedProductType: r.feed_product_type,
      recommendedBrowseNodes: r.recommended_browse_nodes,
      genericKeywords: r.generic_keywords,
      platinumKeywords: r.platinum_keywords,
      variationGroup: r.variation_group,
      variationRef: r.variation_ref,
      groupRef: r.group_ref,
      contentSeo: r.content_seo,
      variations: r.variations,
      packaging: r.packaging,
      targetAudience: r.target_audience,
      fulfillment: r.fulfillment,
      productAttributes: r.product_attributes,
      nutritionSupplements: r.nutrition_supplements,
      complianceSafety: r.compliance_safety,
      images: r.images,
      dimensionsWeight: r.dimensions_weight,
      otherAttributes: r.other_attributes,
      rawColumnValues: r.raw_column_values,
      isDirty: r.is_dirty,
      changeLog: r.change_log,
      updatedAt: r.updated_at,
      lastPublishedAt: r.last_published_at,
      createdAt: r.created_at,
    } as unknown as Product;
    for (const k of Object.keys(mapProductToBqRow(product))) {
      const safe = bqSafe(k);
      if (safe) pgColumns.add(safe);
    }
  }

  // ── Report ────────────────────────────────────────────────────────────
  const onlyInPg = diff(pgIds, bqIds);
  const onlyInBq = diff(bqIds, pgIds);
  const shared = [...pgIds].filter((x) => bqIds.has(x)).length;

  const colsBqOnly = diff(bqColumns, pgColumns);
  const colsPgOnly = diff(pgColumns, bqColumns);
  const colsShared = [...pgColumns].filter((x) => bqColumns.has(x)).length;

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("ROW COUNTS");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  Postgres  : ${fmt(pgCount)}  (dirty / unpublished: ${fmt(dirtyCount)})`);
  console.log(`  BigQuery  : ${fmt(bqCount)}`);
  console.log(`  Δ         : ${fmt(pgCount - bqCount)}`);

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("IDENTITY TUPLES (SKU | ASIN | Marketplace)");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  Shared    : ${fmt(shared)}`);
  console.log(`  Only PG   : ${fmt(onlyInPg.length)}`);
  console.log(`  Only BQ   : ${fmt(onlyInBq.length)}`);
  if (onlyInPg.length > 0) {
    console.log(`\n  First ${Math.min(SAMPLE_COUNT, onlyInPg.length)} only-in-PG:`);
    onlyInPg.slice(0, SAMPLE_COUNT).forEach((t) => console.log(`    ${t}`));
  }
  if (onlyInBq.length > 0) {
    console.log(`\n  First ${Math.min(SAMPLE_COUNT, onlyInBq.length)} only-in-BQ:`);
    onlyInBq.slice(0, SAMPLE_COUNT).forEach((t) => console.log(`    ${t}`));
  }

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("SCHEMA COLUMNS");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  BQ columns       : ${fmt(bqColumns.size)}`);
  console.log(`  PG → BQ columns  : ${fmt(pgColumns.size)}  (what publishToBigQuery would write)`);
  console.log(`  Shared           : ${fmt(colsShared)}`);
  console.log(`  Only in BQ       : ${fmt(colsBqOnly.length)}`);
  console.log(`  Only in PG → BQ  : ${fmt(colsPgOnly.length)}`);
  if (colsBqOnly.length > 0) {
    console.log(`\n  First ${Math.min(20, colsBqOnly.length)} BQ-only columns:`);
    colsBqOnly.slice(0, 20).forEach((c) => console.log(`    ${c}`));
  }
  if (colsPgOnly.length > 0) {
    console.log(`\n  First ${Math.min(20, colsPgOnly.length)} PG-only columns:`);
    colsPgOnly.slice(0, 20).forEach((c) => console.log(`    ${c}`));
  }

  console.log("");
  process.exit(0);
}

main().catch((err) => {
  console.error("Diff error:", err);
  process.exit(1);
});
