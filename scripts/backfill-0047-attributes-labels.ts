/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/async-await-in-loop */
// scripts/backfill-0047-attributes-labels.ts
//
// Idempotent backfill of label-variant columns on the renamed `attributes`
// table. Run after run-migration-0047 succeeds and BEFORE any application
// writes to attributes (Phase C/D/E). Re-running is safe.
//
//   1. clr_label = general_label (when null) — they match for the existing
//      972 rows; future drift is filled by syncAttributes() from the Sheet.
//   2. sc_label_multi = 'concat' for the 5 known multi-instance attrs.
//   3. alr_label seeded from a hardcoded map drawn from current alr-parser.
//   4. sb_label inferred from snake_case(bq_label) when that snake_case
//      matches an actual master column; logged otherwise.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

const SC_MULTI_CONCAT: ReadonlyArray<string> = [
  "GenericKeywords",
  "PlatinumKeywords",
];

const ALR_LABELS: Record<string, string> = {
  SKU: "seller-sku",
  ASIN: "asin1",
  ItemName: "item-name",
  ListPrice: "price",
  MainImageURL: "image-url",
  Status: "status",
  // Below land in master.rawColumnValues today but are still useful for
  // round-trip lookups.
  Quantity: "quantity",
  ListingId: "listing-id",
  FulfillmentChannel: "fulfillment-channel",
  OpenDate: "open-date",
  ItemDescription: "item-description",
};

function snakeCase(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s\-]+/g, "_")
    .toLowerCase();
}

async function main() {
  console.log("Backfill 0047 — label variants...");

  try {
    // 0. Drop stale trigger: set_column_attributes_updated_at was created on
    //    column_attributes but that table never had an updated_at column.
    //    The trigger survived the rename to `attributes` and fires on any
    //    UPDATE, causing PL/pgSQL error 42703. Drop it idempotently.
    await sql`
      DROP TRIGGER IF EXISTS set_column_attributes_updated_at ON attributes
    `;
    console.log("  ✓ stale trigger set_column_attributes_updated_at dropped");

    // 1. clr_label = general_label where null.
    const r1 = await sql`
      UPDATE attributes
      SET clr_label = general_label
      WHERE clr_label IS NULL
    `;
    console.log(`  ✓ clr_label populated: ${r1.count} rows`);

    // 2. sc_label_multi = 'concat' for known multi-instance attrs.
    const r2 = await sql`
      UPDATE attributes
      SET sc_label_multi = 'concat'
      WHERE general_label = ANY(${SC_MULTI_CONCAT}::text[])
        AND sc_label_multi IS DISTINCT FROM 'concat'
    `;
    console.log(`  ✓ sc_label_multi='concat' set: ${r2.count} rows`);

    // 3. alr_label seed.
    for (const [generalLabel, alrLabel] of Object.entries(ALR_LABELS)) {
      await sql`
        UPDATE attributes
        SET alr_label = ${alrLabel}
        WHERE general_label = ${generalLabel}
          AND alr_label IS DISTINCT FROM ${alrLabel}
      `;
    }
    console.log(`  ✓ alr_label seeded for ${Object.keys(ALR_LABELS).length} attributes`);

    // 4. sb_label — best-effort match against master columns.
    const masterCols = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'master'
    `;
    const masterColSet = new Set(masterCols.map((r) => r.column_name));
    const rows = await sql<{ id: number; general_label: string; bq_label: string | null }[]>`
      SELECT id, general_label, bq_label FROM attributes WHERE sb_label IS NULL
    `;
    let matched = 0;
    let unmatched: string[] = [];
    for (const row of rows) {
      // Try bq_label first; fall back to general_label. bq_label often has
      // CLR-style suffixes (e.g. `item_name_marketplace_id=...#1_value`) that
      // prevent a clean match, so we always also try general_label snake_case.
      const candidates = [
        row.bq_label ? snakeCase(row.bq_label) : null,
        snakeCase(row.general_label),
      ].filter(Boolean) as string[];
      const candidate = candidates.find((c) => masterColSet.has(c));
      if (candidate) {
        await sql`UPDATE attributes SET sb_label = ${candidate} WHERE id = ${row.id}`;
        matched++;
      } else {
        unmatched.push(row.general_label);
      }
    }
    console.log(`  ✓ sb_label matched ${matched} of ${rows.length} (manual fill needed for ${unmatched.length})`);
    if (unmatched.length > 0) {
      console.log("    unmatched:", unmatched.slice(0, 20).join(", "), unmatched.length > 20 ? "…" : "");
    }

    console.log("\nBackfill complete.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
