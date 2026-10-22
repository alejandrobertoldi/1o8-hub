/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

const directUrl = process.env.DATABASE_URL!.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

(async () => {
  // For each duplicate (client_id_code, sku) row, count its dependent rows
  // across every FK-referencing table. We want to know whether picking
  // "newest" as canonical loses any real data.
  const rows = await sql`
    WITH dups AS (
      SELECT m.id, m.client_id_code, m.sku, m.updated_at,
             ROW_NUMBER() OVER (PARTITION BY m.client_id_code, m.sku ORDER BY m.updated_at DESC, m.id) AS rn
        FROM master m
        WHERE m.client_id_code IS NOT NULL AND m.sku IS NOT NULL
    ),
    in_dup_group AS (
      SELECT * FROM dups
       WHERE (client_id_code, sku) IN (
         SELECT client_id_code, sku FROM dups GROUP BY client_id_code, sku HAVING count(*) > 1
       )
    )
    SELECT
      d.client_id_code, d.sku, d.id, d.rn, d.updated_at,
      (SELECT count(*) FROM activity_log WHERE product_id = d.id) AS activity_log,
      (SELECT count(*) FROM field_comments WHERE product_id = d.id) AS field_comments,
      (SELECT count(*) FROM amazon_snapshots WHERE product_id = d.id) AS amazon_snapshots,
      (SELECT count(*) FROM product_key_overrides WHERE product_id = d.id) AS product_key_overrides,
      (SELECT count(*) FROM amazon_sync_snapshots WHERE product_id = d.id) AS amazon_sync_snapshots,
      (SELECT count(*) FROM amazon_sync_discrepancies WHERE product_id = d.id) AS amazon_sync_discrepancies,
      (SELECT count(*) FROM aplus_sets WHERE product_id = d.id) AS aplus_sets,
      (SELECT count(*) FROM aplus_modules WHERE product_id = d.id) AS aplus_modules,
      (SELECT count(*) FROM aplus_comments WHERE product_id = d.id) AS aplus_comments,
      (SELECT count(*) FROM brand_story WHERE product_id = d.id) AS brand_story,
      (SELECT count(*) FROM variety_pack_items WHERE pack_product_id = d.id) AS varieties_pack,
      (SELECT count(*) FROM variety_pack_items WHERE included_product_id = d.id) AS varieties_inc,
      (SELECT count(*) FROM variation_tag_assignments WHERE product_id = d.id) AS variation_tags,
      (SELECT count(*) FROM variation_group_assignments WHERE product_id = d.id) AS variation_groups,
      (SELECT count(*) FROM content_impact_snapshots WHERE product_id = d.id) AS impact_snapshots,
      (SELECT count(*) FROM seo_projects WHERE linked_product_id = d.id) AS seo_projects
    FROM in_dup_group d
    ORDER BY d.client_id_code, d.sku, d.rn
  `;
  for (const r of rows) {
    const total = Object.entries(r)
      .filter(([k]) => !["client_id_code", "sku", "id", "rn", "updated_at"].includes(k))
      .reduce((acc, [, v]) => acc + Number(v ?? 0), 0);
    console.log(
      `${r.client_id_code}/${r.sku} rn=${r.rn} id=${r.id} updated=${(r.updated_at as Date).toISOString().slice(0, 19)} deps=${total}`,
    );
    if (total > 0) {
      const breakdown = Object.entries(r)
        .filter(([k, v]) => !["client_id_code", "sku", "id", "rn", "updated_at"].includes(k) && Number(v) > 0)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      console.log(`  ${breakdown}`);
    }
  }
  await sql.end();
})();
