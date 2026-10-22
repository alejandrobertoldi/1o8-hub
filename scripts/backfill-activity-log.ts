/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Backfill the activity_log table from existing product changeLog entries.
 * Usage: npx tsx scripts/backfill-activity-log.ts
 *
 * This reads all products with non-empty changeLog arrays and inserts
 * corresponding rows into activity_log. Safe to run multiple times —
 * it skips products that already have activity_log entries.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { db } from "../src/lib/db";
import { master, activityLog } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Fetching products with changeLog entries...");

  // Get all products that have a non-empty changeLog
  const allProducts = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      clientIdCode: master.clientIdCode,
      itemName: master.itemName,
      changeLog: master.changeLog,
    })
    .from(master)
    .where(sql`jsonb_array_length(COALESCE(${master.changeLog}, '[]'::jsonb)) > 0`);

  console.log(`Found ${allProducts.length} products with changeLog entries.`);

  if (allProducts.length === 0) {
    console.log("Nothing to backfill.");
    process.exit(0);
  }

  // Check which products already have activity_log entries
  const existingProducts = await db
    .select({ productId: activityLog.productId })
    .from(activityLog)
    .groupBy(activityLog.productId);

  const existingSet = new Set(existingProducts.map((r) => r.productId));
  const toBackfill = allProducts.filter((p) => !existingSet.has(p.id));

  console.log(
    `${existingSet.size} products already have activity entries, ` +
    `${toBackfill.length} products to backfill.`
  );

  if (toBackfill.length === 0) {
    console.log("Nothing to backfill.");
    process.exit(0);
  }

  let totalInserted = 0;

  // Process in batches of 50 products
  const batchSize = 50;
  for (let i = 0; i < toBackfill.length; i += batchSize) {
    const batch = toBackfill.slice(i, i + batchSize);
    const rows: Array<{
      productId: string;
      asin: string | null;
      sku: string | null;
      clientIdCode: string | null;
      itemName: string | null;
      fieldLabel: string;
      bqName: string;
      oldValue: string | null;
      newValue: string | null;
      changedBy: string;
      changedAt: Date;
      editType: string;
    }> = [];

    for (const product of batch) {
      const entries = product.changeLog ?? [];
      for (const entry of entries) {
        rows.push({
          productId: product.id,
          asin: product.asin,
          sku: product.sku,
          clientIdCode: product.clientIdCode,
          itemName: product.itemName,
          fieldLabel: entry.field,
          bqName: entry.field,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
          changedBy: entry.changedBy,
          changedAt: new Date(entry.changedAt),
          editType: "single",
        });
      }
    }

    if (rows.length > 0) {
      await db.insert(activityLog).values(rows);
      totalInserted += rows.length;
    }

    console.log(
      `Processed products ${i + 1}–${Math.min(i + batchSize, toBackfill.length)} ` +
      `(${rows.length} entries)`
    );
  }

  console.log(`Backfill complete. Inserted ${totalInserted} activity log entries.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
