/**
 * Read-only detector for JSONB keys that shadow a core `master` column.
 *
 * Background: a "shadow" is a key inside one of master's JSONB blobs whose name
 * corresponds to a column that actually lives in a dedicated core column. The UI
 * reads the core column, so a shadow is invisible in the app while still being
 * carried into a BigQuery publish through rawColumnValues — the two can disagree
 * silently.
 *
 * Three classes are reported:
 *
 *   1. PascalCase core names inside other_attributes — the bulk-edit misroute class.
 *      Expected to be 0: activity_log has never recorded an edit_type='bulk' row.
 *   2. raw Amazon flat-file names (attributes.bq_label) inside other_attributes —
 *      the class produced by whatever wrote `main_product_image_locator`. As of
 *      2026-08-12: 46 rows for main_product_image_locator (2 of them diverging from
 *      main_image_url), ~40 rows each for other_product_image_locator_1..8, plus
 *      benign import residue for UUID / IntentwiseID / VariationID.
 *   3. A per-row divergence check for the main-image case, which is the only known
 *      shadow of a genuine core column.
 *
 * This script issues SELECTs only. It takes no arguments and writes nothing.
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import postgres from "postgres";
import { CORE_COLUMNS } from "../src/lib/column-registry";

// DATABASE_URL as-is (Supavisor transaction pooler, port 6543). Do NOT rewrite the
// port to 5432 the way some older scripts do: Supabase's direct connection is
// IPv6-only and resolves to ENOTFOUND from this machine. A read-only script issues
// no session-level SET, so the transaction pooler is safe here.
const sql = postgres(process.env.DATABASE_URL!, { ssl: "require" });

const CORE_BQ_NAMES = CORE_COLUMNS.map((c) => c.bqName);

async function main() {
  console.log("=".repeat(72));
  console.log("JSONB shadows of core master columns — READ ONLY");
  console.log("=".repeat(72));

  const [{ total }] = await sql<{ total: number }[]>`
    SELECT count(*)::int AS total FROM master
  `;
  console.log(`\nmaster rows: ${total}\n`);

  console.log("--- 1. PascalCase core BQ names inside other_attributes ---");
  console.log("    (the bulk-edit misroute class — expected: none)\n");
  const coreShadows = await sql<{ key: string; rows: number }[]>`
    SELECT k AS key, count(*)::int AS rows
      FROM master m, jsonb_object_keys(coalesce(m.other_attributes, '{}'::jsonb)) k
     WHERE k = ANY(${CORE_BQ_NAMES})
     GROUP BY k
     ORDER BY rows DESC
  `;
  if (coreShadows.length === 0) {
    console.log("    none ✅\n");
  } else {
    for (const r of coreShadows) {
      console.log(`    ${r.key.padEnd(32)} ${r.rows} row(s)  ⚠️`);
    }
    console.log("");
  }

  console.log("--- 2. raw Amazon flat-file names inside other_attributes ---");
  console.log("    (keys that match an attributes.bq_label)\n");
  const flatFileShadows = await sql<
    { key: string; general_label: string; rows: number }[]
  >`
    SELECT k AS key, a.general_label, count(*)::int AS rows
      FROM master m, jsonb_object_keys(coalesce(m.other_attributes, '{}'::jsonb)) k
      JOIN attributes a ON a.bq_label = k
     GROUP BY k, a.general_label
     ORDER BY rows DESC
     LIMIT 50
  `;
  if (flatFileShadows.length === 0) {
    console.log("    none ✅\n");
  } else {
    for (const r of flatFileShadows) {
      const core = CORE_BQ_NAMES.includes(r.general_label) ? "  ⚠️ CORE" : "";
      console.log(
        `    ${r.key.slice(0, 40).padEnd(42)} -> ${r.general_label.padEnd(22)} ${String(r.rows).padStart(5)} row(s)${core}`
      );
    }
    console.log("");
  }

  console.log("--- 3. main image: shadow vs core column ---\n");
  const [img] = await sql<
    { rows_with_shadow: number; core_diverged: number; dirty: number }[]
  >`
    SELECT count(*)::int AS rows_with_shadow,
           count(*) FILTER (
             WHERE other_attributes->>'main_product_image_locator'
                   IS DISTINCT FROM main_image_url
           )::int AS core_diverged,
           count(*) FILTER (WHERE is_dirty)::int AS dirty
      FROM master
     WHERE other_attributes ? 'main_product_image_locator'
  `;
  console.log(`    rows carrying the shadow : ${img.rows_with_shadow}`);
  console.log(`    value differs from core  : ${img.core_diverged}`);
  console.log(`    is_dirty                 : ${img.dirty}\n`);

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
