import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  const before = await sql`
    SELECT id, asin, variation_theme_name, size, color, flavor, style
    FROM seo_asins
    WHERE parentage_level = 'Parent'
    ORDER BY variation_theme_name, asin
  `;
  console.log("BEFORE (parent rows):");
  console.table(before);

  const result = await sql`
    UPDATE seo_asins
    SET
      size   = CASE WHEN variation_theme_name ILIKE '%size%'   THEN 'Parent' ELSE size   END,
      color  = CASE WHEN variation_theme_name ILIKE '%color%'  THEN 'Parent' ELSE color  END,
      flavor = CASE WHEN variation_theme_name ILIKE '%flavor%' THEN 'Parent' ELSE flavor END,
      style  = CASE WHEN variation_theme_name ILIKE '%style%'  THEN 'Parent' ELSE style  END
    WHERE parentage_level = 'Parent'
      AND variation_theme_name IS NOT NULL
    RETURNING id
  `;
  console.log(`\nRows updated: ${result.length}`);

  const after = await sql`
    SELECT id, asin, variation_theme_name, size, color, flavor, style
    FROM seo_asins
    WHERE parentage_level = 'Parent'
    ORDER BY variation_theme_name, asin
  `;
  console.log("\nAFTER (parent rows):");
  console.table(after);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
