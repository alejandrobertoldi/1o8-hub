/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Backfill 6 columns that exist in BQ with values but are missing from
 * PG `master.raw_column_values`. These columns were added to Amazon's
 * product attribute schema after the original BQ → PG import.
 *
 * Strategy: JSONB merge into raw_column_values for matching products.
 *           Only ADDS missing keys (uses `||` operator). Does NOT touch:
 *             - is_dirty
 *             - last_published_at
 *             - any other field
 *           Idempotent — safe to re-run.
 *
 * Usage:
 *   npx -p dotenv-cli dotenv -e .env.local -- npx tsx scripts/backfill-bq-only-cols.ts            # dry run
 *   npx -p dotenv-cli dotenv -e .env.local -- npx tsx scripts/backfill-bq-only-cols.ts --apply    # write
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8Hub";
const TABLE = process.env.BQ_TABLE || "Master";
const FQTN = `${PROJECT_ID}.${DATASET}.${TABLE}`;

const TARGET_COLS = [
  "NumberOfItems",
  "NumberOfBoxes",
  "NumberOfPieces",
  "AreBatteriesRequired",
  "IsTheItemHeatSensitive",
  "IsTheLiquidProductDoubleSealed",
];

const APPLY = process.argv.includes("--apply");

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

type BqRow = {
  SKU: string | null;
  ASIN: string | null;
  Marketplace: string | null;
} & Record<string, string | null>;

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes — pass --apply to write)"}`);
  console.log(`Target columns: ${TARGET_COLS.join(", ")}\n`);

  const bq = getBigQueryClient();

  // Pull all BQ rows where ANY of the 6 columns has a value
  const colSelectors = TARGET_COLS.map((c) => `\`${c}\``).join(", ");
  const whereClauses = TARGET_COLS.map(
    (c) => `(\`${c}\` IS NOT NULL AND \`${c}\` != '')`
  ).join(" OR ");

  console.log("→ Querying BQ for rows with any of the 6 columns populated...");
  const [bqRows] = await bq.query({
    query: `SELECT SKU, ASIN, Marketplace, ${colSelectors}
            FROM \`${FQTN}\`
            WHERE ${whereClauses}`,
  });
  console.log(`  Found ${(bqRows as unknown[]).length} BQ rows with target data.\n`);

  let matched = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let alreadyHadAll = 0;
  let noPgMatch = 0;
  let cellsAdded = 0;

  for (const r of bqRows as BqRow[]) {
    if (!r.SKU || !r.ASIN || !r.Marketplace) continue;

    // Build the patch object: only keys with non-empty BQ values
    const patch: Record<string, string> = {};
    for (const col of TARGET_COLS) {
      const v = r[col];
      if (v != null && v !== "") patch[col] = String(v);
    }
    if (Object.keys(patch).length === 0) continue;

    // Look up matching PG row
    const pgRows = (await db.execute(sql`
      SELECT id, raw_column_values
      FROM "master"
      WHERE sku = ${r.SKU} AND asin = ${r.ASIN} AND marketplace = ${r.Marketplace}
    `)) as unknown as Array<{
      id: string;
      raw_column_values: Record<string, string> | null;
    }>;

    if (pgRows.length === 0) {
      noPgMatch++;
      continue;
    }
    matched++;

    for (const pg of pgRows) {
      // Filter patch to only keys PG doesn't already have (or has as empty)
      const raw = pg.raw_column_values ?? {};
      const filteredPatch: Record<string, string> = {};
      for (const [k, v] of Object.entries(patch)) {
        const existing = raw[k];
        if (existing === undefined || existing === null || existing === "") {
          filteredPatch[k] = v;
        }
      }
      const newKeys = Object.keys(filteredPatch);
      if (newKeys.length === 0) {
        alreadyHadAll++;
        continue;
      }

      wouldUpdate++;
      cellsAdded += newKeys.length;

      if (APPLY) {
        // JSONB || merge: existing keys preserved, new keys added.
        // Since we filtered to missing keys only, this is purely additive.
        await db.execute(sql`
          UPDATE "master"
          SET raw_column_values = COALESCE(raw_column_values, '{}'::jsonb) || ${JSON.stringify(filteredPatch)}::jsonb
          WHERE id = ${pg.id}
        `);
        updated++;
      }
    }
  }

  console.log("══════════════════════════════════════════════════════════════════");
  console.log("BACKFILL SUMMARY");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  BQ rows with target data : ${(bqRows as unknown[]).length}`);
  console.log(`  Matched in PG            : ${matched}`);
  console.log(`  No PG match              : ${noPgMatch}  (likely the 4 only-in-BQ products)`);
  console.log(`  Already had all keys     : ${alreadyHadAll}`);
  console.log(`  Would update             : ${wouldUpdate}`);
  console.log(`  Cells added              : ${cellsAdded}`);
  if (APPLY) {
    console.log(`  Actually updated         : ${updated}`);
  } else {
    console.log(`  (dry run — pass --apply to write)`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill error:", err);
  process.exit(1);
});
