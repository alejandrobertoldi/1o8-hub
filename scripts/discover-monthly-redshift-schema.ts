/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Redshift schema discovery spike for Monthly Reports (Task 0).
 *
 * Gate for V1 scope of Products + B2B sections — see
 * docs/superpowers/research/2026-04-23-redshift-monthly-schema.md.
 *
 * Notes for reruns:
 * - Tables in `intentwise_ecommerce_graph` are Redshift Spectrum EXTERNAL tables.
 *   They do NOT appear in `pg_tables` and their columns are NOT in
 *   `information_schema.columns`. Use `svv_external_tables` + `svv_external_columns`.
 * - `SELECT COUNT(*) ... AS c` returns c as a STRING in this driver, so truthy
 *   checks like `if (rows[0]?.c)` give false positives. Coerce to Number.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { queryRedshift } from "../src/lib/redshift";

const SCHEMA = "intentwise_ecommerce_graph";

async function logCols(table: string) {
  const cols = await queryRedshift<{ columnname: string; external_type: string }>(
    `SELECT columnname, external_type FROM svv_external_columns
     WHERE schemaname=$1 AND tablename=$2
     ORDER BY columnnum`,
    [SCHEMA, table],
  );
  if (!cols.length) {
    console.log("    (no columns returned — table may be local/native or absent)");
    return;
  }
  for (const c of cols) console.log(`    ${c.columnname}  (${c.external_type})`);
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await queryRedshift<{ c: string | number }>(
    `SELECT COUNT(*) AS c FROM svv_external_tables
     WHERE schemaname=$1 AND tablename=$2`,
    [SCHEMA, table],
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  console.log(`=== Tables in ${SCHEMA} (svv_external_tables) ===\n`);
  const tables = await queryRedshift<{ tablename: string }>(
    `SELECT tablename FROM svv_external_tables
     WHERE schemaname=$1 ORDER BY tablename`,
    [SCHEMA],
  );
  for (const t of tables) console.log(`  ${t.tablename}`);

  console.log("\n=== Columns of advertised_product_summary ===");
  await logCols("advertised_product_summary");

  console.log("\n=== Columns of account_summary ===");
  await logCols("account_summary");

  console.log("\n=== Columns of product_summary ===");
  await logCols("product_summary");

  // Probe for additional candidate per-ASIN / business-report tables.
  const probes = [
    "business_report", "asin_summary", "asin_report",
    "business_summary", "traffic_summary",
    "seller_central_business_report",
  ];
  console.log("\n=== Probing other candidate per-ASIN tables ===");
  for (const p of probes) {
    const ok = await tableExists(p);
    console.log(`  ${ok ? "✓" : "✗"} ${p}${ok ? " exists" : " not found"}`);
    if (ok) await logCols(p);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
