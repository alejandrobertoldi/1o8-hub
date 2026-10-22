// scripts/backfill-0047-is-vp.ts
//
// 1. Insert (or update) the synthetic `IsVP` row into attributes with
//    is_vp_flag = true.
// 2. Backfill master.is_vp from existing string-match logic on the
//    `variations` JSONB blob (Flavor / Color / Size / Style ILIKE
//    '%Variety Pack%'). Idempotent.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Backfill 0047 — IsVP attribute + master.is_vp…");

  // 1. Insert / upsert the IsVP row.
  await sql`
    INSERT INTO attributes (
      master_row, general_label, description, bq_data_type,
      sb_label, bq_label, is_vp_flag, reference_group, is_essential
    ) VALUES (
      999999, 'IsVP',
      'Marks the product as a Variety Pack. When true, variation attribute values become multi-valued.',
      'BOOLEAN', 'is_vp', 'IsVP', true, 'Hub-Internal', false
    )
    ON CONFLICT (general_label) DO UPDATE SET
      is_vp_flag = EXCLUDED.is_vp_flag,
      sb_label   = EXCLUDED.sb_label,
      bq_label   = EXCLUDED.bq_label,
      description = EXCLUDED.description,
      bq_data_type = EXCLUDED.bq_data_type,
      reference_group = EXCLUDED.reference_group
  `;
  console.log("  ✓ IsVP attribute row upserted");

  // 2. Backfill master.is_vp from the variations JSONB.
  const r = await sql`
    UPDATE master
    SET is_vp = true
    WHERE is_vp = false
      AND (
        (variations ->> 'Flavor') ILIKE '%Variety Pack%' OR
        (variations ->> 'Color')  ILIKE '%Variety Pack%' OR
        (variations ->> 'Size')   ILIKE '%Variety Pack%' OR
        (variations ->> 'Style')  ILIKE '%Variety Pack%'
      )
  `;
  console.log(`  ✓ master.is_vp set on ${r.count} rows`);

  await sql.end();
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
