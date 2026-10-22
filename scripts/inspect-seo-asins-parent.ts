import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  const totals = await sql`
    SELECT
      COUNT(*) FILTER (WHERE parentage_level = 'Parent') AS parent_count,
      COUNT(*) FILTER (WHERE parentage_level = 'Child') AS child_count,
      COUNT(*) FILTER (WHERE parentage_level IS NULL OR parentage_level NOT IN ('Parent','Child')) AS other_count,
      COUNT(*) AS total
    FROM seo_asins
  `;
  console.log("seo_asins totals:", totals[0]);

  const themeBreakdown = await sql`
    SELECT
      variation_theme_name,
      COUNT(*) AS parent_rows,
      COUNT(*) FILTER (WHERE size IS NOT NULL AND size <> 'Parent') AS size_has_value,
      COUNT(*) FILTER (WHERE color IS NOT NULL AND color <> 'Parent') AS color_has_value,
      COUNT(*) FILTER (WHERE flavor IS NOT NULL AND flavor <> 'Parent') AS flavor_has_value,
      COUNT(*) FILTER (WHERE style IS NOT NULL AND style <> 'Parent') AS style_has_value,
      COUNT(*) FILTER (WHERE size = 'Parent') AS size_eq_parent,
      COUNT(*) FILTER (WHERE color = 'Parent') AS color_eq_parent,
      COUNT(*) FILTER (WHERE flavor = 'Parent') AS flavor_eq_parent,
      COUNT(*) FILTER (WHERE style = 'Parent') AS style_eq_parent
    FROM seo_asins
    WHERE parentage_level = 'Parent'
    GROUP BY variation_theme_name
    ORDER BY parent_rows DESC
  `;
  console.log("\nParent rows by variation_theme_name:");
  console.table(themeBreakdown);

  // Sample parent rows where Option-2 would change something
  const wouldChange = await sql`
    SELECT id, asin, variation_theme_name, size, color, flavor, style
    FROM seo_asins
    WHERE parentage_level = 'Parent'
      AND variation_theme_name IS NOT NULL
      AND (
        (variation_theme_name ILIKE '%size%'   AND (size   IS DISTINCT FROM 'Parent')) OR
        (variation_theme_name ILIKE '%color%'  AND (color  IS DISTINCT FROM 'Parent')) OR
        (variation_theme_name ILIKE '%flavor%' AND (flavor IS DISTINCT FROM 'Parent')) OR
        (variation_theme_name ILIKE '%style%'  AND (style  IS DISTINCT FROM 'Parent'))
      )
    LIMIT 20
  `;
  console.log("\nSample parent rows that would change under Option 2:");
  console.table(wouldChange);

  const changeCount = await sql`
    SELECT COUNT(*) AS rows_affected
    FROM seo_asins
    WHERE parentage_level = 'Parent'
      AND variation_theme_name IS NOT NULL
      AND (
        (variation_theme_name ILIKE '%size%'   AND (size   IS DISTINCT FROM 'Parent')) OR
        (variation_theme_name ILIKE '%color%'  AND (color  IS DISTINCT FROM 'Parent')) OR
        (variation_theme_name ILIKE '%flavor%' AND (flavor IS DISTINCT FROM 'Parent')) OR
        (variation_theme_name ILIKE '%style%'  AND (style  IS DISTINCT FROM 'Parent'))
      )
  `;
  console.log("\nTotal parent rows that would change:", changeCount[0]);

  // Parents with NULL or unparseable theme — Option 2 leaves these alone
  const noTheme = await sql`
    SELECT COUNT(*) AS untouched_parent_count
    FROM seo_asins
    WHERE parentage_level = 'Parent'
      AND (
        variation_theme_name IS NULL
        OR (
          variation_theme_name NOT ILIKE '%size%'
          AND variation_theme_name NOT ILIKE '%color%'
          AND variation_theme_name NOT ILIKE '%flavor%'
          AND variation_theme_name NOT ILIKE '%style%'
        )
      )
  `;
  console.log("Parent rows Option 2 will NOT touch (no matching theme keyword):", noTheme[0]);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
