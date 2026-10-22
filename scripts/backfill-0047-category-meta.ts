/* eslint-disable react-doctor/async-await-in-loop */
// scripts/backfill-0047-category-meta.ts
//
// Idempotent rollup: read every category_attributes row joined to its
// category_definitions parent and merge it into attributes.category_meta
// JSONB. Path: $.{marketplaceId}.{productType} = { requirement, validValues,
// description, example, isKey }.
//
// Matching: try attributes.sc_label first (with {MP}/{LANG} placeholder
// substitution), then fall back to category_attributes.bible_field_match
// matched against attributes.general_label. Unmatched rows are logged.
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

interface AttrRow { id: number; general_label: string; sc_label: string | null }
interface CatAttrRow {
  id: number;
  amazon_field_name: string;
  requirement: string;
  valid_values: string[] | null;
  description: string | null;
  example: string | null;
  bible_field_match: string | null;
  is_key: boolean;
  marketplace_id: string;
  product_type: string;
}

function scLabelToRegex(scLabel: string): RegExp {
  // {MP} and {LANG} are placeholders; rest of string is treated as a literal.
  const escaped = scLabel
    .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    .replace(/\\\{MP\\\}/g, "[^\\]]+")
    .replace(/\\\{LANG\\\}/g, "[^\\]]+");
  return new RegExp(`^${escaped}$`);
}

function matchAttribute(
  amazonFieldName: string,
  bibleFieldMatch: string | null,
  attrs: AttrRow[],
  byGeneralLabel: Map<string, AttrRow>,
): AttrRow | null {
  // 1. sc_label regex.
  for (const a of attrs) {
    if (!a.sc_label) continue;
    const re = scLabelToRegex(a.sc_label);
    if (re.test(amazonFieldName)) return a;
  }
  // 2. fallback to bibleFieldMatch → general_label.
  if (bibleFieldMatch && byGeneralLabel.has(bibleFieldMatch)) {
    return byGeneralLabel.get(bibleFieldMatch)!;
  }
  return null;
}

async function main() {
  console.log("Backfill 0047 — category_meta…");

  try {
    const attrs = await sql<AttrRow[]>`SELECT id, general_label, sc_label FROM attributes`;
    const byGeneralLabel = new Map(attrs.map((a) => [a.general_label, a]));
    console.log(`  attributes loaded: ${attrs.length}`);

    const catAttrs = await sql<CatAttrRow[]>`
      SELECT
        ca.id, ca.amazon_field_name, ca.requirement, ca.valid_values,
        ca.description, ca.example, ca.bible_field_match, ca.is_key,
        cd.marketplace_id, cd.product_type
      FROM category_attributes ca
      JOIN category_definitions cd ON cd.id = ca.definition_id
    `;
    console.log(`  category_attributes loaded: ${catAttrs.length}`);

    let matched = 0;
    let unmatched = 0;
    const unmatchedSamples: string[] = [];

    for (const ca of catAttrs) {
      const attr = matchAttribute(ca.amazon_field_name, ca.bible_field_match, attrs, byGeneralLabel);
      if (!attr) {
        unmatched++;
        if (unmatchedSamples.length < 25) unmatchedSamples.push(ca.amazon_field_name);
        continue;
      }
      const entry = {
        requirement: ca.requirement,
        validValues: ca.valid_values,
        description: ca.description,
        example: ca.example,
        isKey: ca.is_key,
      };
      // sql.json() binds the JS object as a native jsonb parameter. Using
      // ${JSON.stringify(entry)}::jsonb here would round-trip through a
      // text→jsonb cast that postgres.js double-encodes, leaving the value
      // as a JSONB string ('"{\"requirement\":\"…\"}"') instead of an object.
      await sql`
        UPDATE attributes
        SET category_meta = jsonb_set(
          jsonb_set(category_meta, ARRAY[${ca.marketplace_id}::text], COALESCE(category_meta->${ca.marketplace_id}, '{}'::jsonb), true),
          ARRAY[${ca.marketplace_id}::text, ${ca.product_type}::text],
          ${sql.json(entry)},
          true
        )
        WHERE id = ${attr.id}
      `;
      matched++;
    }

    console.log(`  ✓ matched: ${matched}`);
    console.log(`  ✗ unmatched: ${unmatched}`);
    if (unmatchedSamples.length) {
      console.log("    samples:", unmatchedSamples.join("\n             "));
    }
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
