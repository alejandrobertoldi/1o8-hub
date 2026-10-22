/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Import all product rows from BigQuery into PostgreSQL.
 *
 * Usage: npx tsx scripts/import-from-bigquery.ts
 *
 * Modes:
 *   --upsert  Update existing products with fresh BQ data (default: skip existing)
 *
 * This reads all rows from the BQ table, maps each to the app's hybrid schema,
 * and inserts/updates them in the products table.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import { db } from "../src/lib/db";
import { master } from "../src/lib/db/schema";
import { mapBqRowToProduct, type BqRow } from "../src/lib/product-mapper";
import { and, eq } from "drizzle-orm";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8BibleApp";
const TABLE = process.env.BQ_TABLE || "Master";

const BATCH_SIZE = 50;
const upsertMode = process.argv.includes("--upsert");

async function main() {
  let bigquery: BigQuery;

  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    bigquery = new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
    });
  } else {
    bigquery = new BigQuery({ projectId: PROJECT_ID });
  }

  console.log(`Querying ${PROJECT_ID}.${DATASET}.${TABLE}...`);
  console.log(`Mode: ${upsertMode ? "UPSERT (update existing)" : "INSERT (skip existing)"}`);

  const [rows] = await bigquery.query({
    query: `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\``,
    location: "us-west1",
  });

  console.log(`Fetched ${rows.length} rows from BigQuery`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      const bqRow = row as BqRow;
      const asin = bqRow.ASIN || null;
      const sku = bqRow.SKU || null;
      const marketplace = bqRow.Marketplace || null;

      // Check for existing product
      if (asin && sku && marketplace) {
        const existing = await db
          .select({ id: master.id })
          .from(master)
          .where(
            and(
              eq(master.asin, asin),
              eq(master.sku, sku),
              eq(master.marketplace, marketplace)
            )
          )
          .limit(1);

        if (existing.length > 0) {
          if (upsertMode) {
            const product = mapBqRowToProduct(bqRow);
            await db
              .update(master)
              .set(product)
              .where(eq(master.id, existing[0].id));
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
      }

      const product = mapBqRowToProduct(bqRow);
      await db.insert(master).values(product);
      inserted++;
    }

    console.log(`Progress: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} (inserted: ${inserted}, updated: ${updated}, skipped: ${skipped})`);
  }

  console.log(`\nImport complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Import error:", err);
  process.exit(1);
});
