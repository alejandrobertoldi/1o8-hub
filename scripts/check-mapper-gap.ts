/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Diagnose: are the 6 "BQ-only with data" columns missing from PG's
 * raw_column_values for the matching products, or just being filtered by the mapper?
 *
 * For each suspect column, pick 1 BQ row with a real value, look up the same
 * product in PG, and dump whether raw_column_values has the key.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { getAllColumns, CORE_COLUMNS } from "../src/lib/column-registry";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8Hub";
const TABLE = process.env.BQ_TABLE || "Master";
const FQTN = `${PROJECT_ID}.${DATASET}.${TABLE}`;

const SUSPECT_COLS = [
  "NumberOfItems",
  "AreBatteriesRequired",
  "IsTheItemHeatSensitive",
  "IsTheLiquidProductDoubleSealed",
  "NumberOfPieces",
  "NumberOfBoxes",
];

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

  // ── First: is each suspect column known to the column-registry at all? ──
  const allRegistryCols = getAllColumns();
  const registryByBqName = new Map(allRegistryCols.map((c) => [c.bqName, c]));
  const coreByBqName = new Map(CORE_COLUMNS.map((c) => [c.bqName, c]));

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("REGISTRY LOOKUP — are these columns known to column-registry?");
  console.log("══════════════════════════════════════════════════════════════════");
  for (const col of SUSPECT_COLS) {
    const reg = registryByBqName.get(col);
    const core = coreByBqName.get(col);
    if (!reg && !core) {
      console.log(`  ✗ UNKNOWN  ${col.padEnd(40)} not in registry → would land in 'otherAttributes'`);
    } else if (core) {
      console.log(`  ✓ CORE     ${col.padEnd(40)} → core field "${core.coreField}"`);
    } else if (reg) {
      console.log(`  ✓ KNOWN    ${col.padEnd(40)} group="${reg.group}"`);
    }
  }

  // ── Per-column empirical check ────────────────────────────────────────
  for (const col of SUSPECT_COLS) {
    console.log(`\n──── ${col} ────`);

    // Sample 1 BQ row that has a value
    const [bqRows] = await bq.query({
      query: `SELECT SKU, ASIN, Marketplace, \`${col}\` AS val
              FROM \`${FQTN}\`
              WHERE \`${col}\` IS NOT NULL AND \`${col}\` != ''
              LIMIT 1`,
    });
    if ((bqRows as unknown[]).length === 0) {
      console.log("  (no BQ rows with value — skipping)");
      continue;
    }
    const sample = bqRows[0] as { SKU: string; ASIN: string; Marketplace: string; val: string };
    console.log(
      `  BQ sample : SKU=${sample.SKU} ASIN=${sample.ASIN} mkt="${sample.Marketplace}" → "${sample.val}"`
    );

    // Look up matching PG row (try exact + trimmed marketplace)
    const trimmedMkt = (sample.Marketplace ?? "").trim();
    const pgRows = (await db.execute(
      sql`SELECT
            sku, asin, marketplace,
            raw_column_values ? ${col} AS has_key,
            raw_column_values ->> ${col} AS raw_val,
            (SELECT COUNT(*) FROM jsonb_object_keys(raw_column_values))::int AS key_count
          FROM "master"
          WHERE sku = ${sample.SKU} AND asin = ${sample.ASIN}
            AND (marketplace = ${sample.Marketplace} OR marketplace = ${trimmedMkt})`
    )) as unknown as Array<{
      sku: string;
      asin: string;
      marketplace: string;
      has_key: boolean;
      raw_val: string | null;
      key_count: number;
    }>;

    if (pgRows.length === 0) {
      console.log("  PG match  : NONE — product not in PG");
      continue;
    }
    for (const p of pgRows) {
      const hasKey = p.has_key ? "✓ has key" : "✗ missing key";
      console.log(
        `  PG row    : mkt="${p.marketplace}" raw_keys=${p.key_count}  ${hasKey}  raw_val="${p.raw_val ?? "(null)"}"`
      );
    }
  }

  // ── Aggregate: what % of PG rows have raw_column_values populated at all? ──
  const [{ total, with_raw, raw_avg_keys }] = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(raw_column_values)::int AS with_raw,
      COALESCE(AVG((SELECT COUNT(*) FROM jsonb_object_keys(raw_column_values)))::int, 0) AS raw_avg_keys
    FROM "master"
  `)) as unknown as [{ total: number; with_raw: number; raw_avg_keys: number }];

  console.log("\n══════════════════════════════════════════════════════════════════");
  console.log("PG raw_column_values health");
  console.log("══════════════════════════════════════════════════════════════════");
  console.log(`  Rows total              : ${total}`);
  console.log(`  Rows with raw_column_values populated : ${with_raw}`);
  console.log(`  Avg keys per raw_column_values        : ${raw_avg_keys}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Mapper gap check error:", err);
  process.exit(1);
});
