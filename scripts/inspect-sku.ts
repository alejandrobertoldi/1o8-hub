/**
 * Diagnostic: dump full state of one SKU across master + staging tables.
 * Usage: npx tsx scripts/inspect-sku.ts MIS_SC_US 111779W
 *
 * Prints (in order):
 *   1. master row — every column, JSONB blobs unrolled, blanks shown as <empty>
 *   2. staged_clr_products row — raw CLR attributes (if present)
 *   3. staged_alr_links row — ASIN + status (if present)
 *   4. Diff: what alias-bridge WOULD produce vs what's in master core columns
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";
import { clrAttributesToBqRow } from "../src/lib/onboarding/clr-attribute-aliases";
import { loadClrAliases } from "../src/lib/onboarding/clr-aliases-loader";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

const KEY_CORE_COLS = [
  "asin",
  "sku",
  "client_id_code",
  "marketplace",
  "status",
  "brand_name",
  "item_name",
  "product_type",
  "feed_product_type",
  "list_price",
  "main_image_url",
  "item_type_keyword",
  "parentage_level",
  "parent_sku",
];

const JSONB_COLS = [
  "content_seo",
  "variations",
  "packaging",
  "target_audience",
  "fulfillment",
  "product_attributes",
  "nutrition_supplements",
  "compliance_safety",
  "images",
  "dimensions_weight",
  "other_attributes",
  "raw_column_values",
];

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function truncate(v: unknown, n = 100): string {
  const s = v === null || v === undefined ? "<null>" : String(v);
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}

async function main() {
  const clientIdCode = process.argv[2];
  const sku = process.argv[3];
  if (!clientIdCode || !sku) {
    console.error("usage: npx tsx scripts/inspect-sku.ts <clientIdCode> <sku>");
    process.exit(1);
  }

  console.log(`\n=== master row for ${clientIdCode}/${sku} ===\n`);
  const masterRows = await sql<Array<Record<string, unknown>>>`
    SELECT *
    FROM master
    WHERE client_id_code = ${clientIdCode} AND sku = ${sku}
    LIMIT 1
  `;

  if (masterRows.length === 0) {
    console.log(`  (no row in master)`);
  } else {
    const m = masterRows[0];
    console.log("# core columns");
    for (const col of KEY_CORE_COLS) {
      const v = m[col];
      const display =
        v === null || v === undefined || v === ""
          ? "<empty>"
          : truncate(v, 80);
      console.log(`  ${pad(col, 22)} ${display}`);
    }

    console.log("\n# JSONB blobs (only non-empty)");
    for (const col of JSONB_COLS) {
      const blob = m[col] as Record<string, unknown> | null;
      if (!blob || Object.keys(blob).length === 0) continue;
      console.log(`  -- ${col} (${Object.keys(blob).length} keys)`);
      for (const [k, v] of Object.entries(blob)) {
        console.log(`     ${pad(k, 40)} ${truncate(v, 80)}`);
      }
    }
  }

  console.log(`\n=== staged_clr_products row for ${clientIdCode}/${sku} ===\n`);
  const stagedClr = await sql<
    Array<{ attributes: Record<string, string>; product_type: string | null; required_complete: boolean }>
  >`
    SELECT attributes, product_type, required_complete
    FROM staged_clr_products
    WHERE client_id_code = ${clientIdCode} AND sku = ${sku}
    LIMIT 1
  `;
  if (stagedClr.length === 0) {
    console.log(`  (no row in staged_clr_products — staging is empty or already merged)`);
  } else {
    const c = stagedClr[0];
    console.log(`  product_type: ${c.product_type}`);
    console.log(`  required_complete: ${c.required_complete}`);
    console.log(`  attributes (${Object.keys(c.attributes).length} keys):`);
    for (const [k, v] of Object.entries(c.attributes)) {
      console.log(`    ${pad(k, 70)} ${truncate(v, 60)}`);
    }
  }

  console.log(`\n=== staged_alr_links row for ${clientIdCode}/${sku} ===\n`);
  const stagedAlr = await sql<Array<{ asin: string | null; status: string | null }>>`
    SELECT asin, status
    FROM staged_alr_links
    WHERE client_id_code = ${clientIdCode} AND sku = ${sku}
    LIMIT 1
  `;
  console.log(stagedAlr.length === 0 ? `  (no row)` : JSON.stringify(stagedAlr[0]));

  // Predict what the new alias bridge WOULD do given the source data.
  // Prefer staging if present (fresh upload); else use master.raw_column_values.
  const sourceAttrs: Record<string, string> | null =
    stagedClr.length > 0
      ? stagedClr[0].attributes
      : masterRows.length > 0 && masterRows[0].raw_column_values
      ? (masterRows[0].raw_column_values as Record<string, string>)
      : null;

  if (sourceAttrs) {
    console.log(
      `\n=== Predicted bqRow from alias bridge (source: ${
        stagedClr.length > 0 ? "staging" : "master.raw_column_values"
      }) ===\n`
    );
    const aliases = await loadClrAliases();
    const bqRow = clrAttributesToBqRow(sourceAttrs, aliases);
    const keys = Object.keys(bqRow).sort();
    if (keys.length === 0) {
      console.log(`  (alias bridge produced 0 entries — source attrs not CLR-format?)`);
    } else {
      for (const k of keys) {
        console.log(`  ${pad(k, 25)} ${truncate(bqRow[k], 80)}`);
      }
    }
  } else {
    console.log(`\n(no source attributes available to predict alias bridge output)`);
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
