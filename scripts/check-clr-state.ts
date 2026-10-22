import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("\n=== staged_clr_products by client ===");
  console.log(await sql`
    SELECT client_id_code, COUNT(*)::int AS count
    FROM staged_clr_products
    GROUP BY client_id_code ORDER BY count DESC
  `);

  console.log("\n=== staged_alr_links by client ===");
  console.log(await sql`
    SELECT client_id_code, COUNT(*)::int AS count
    FROM staged_alr_links
    GROUP BY client_id_code ORDER BY count DESC
  `);

  console.log("\n=== category_definitions by client ===");
  console.log(await sql`
    SELECT client_id_code, COUNT(*)::int AS count
    FROM category_definitions
    GROUP BY client_id_code ORDER BY count DESC
  `);

  console.log("\n=== master rows for MIS_SC_US (sanity) ===");
  console.log(await sql`
    SELECT COUNT(*)::int AS count
    FROM master WHERE client_id_code = 'MIS_SC_US'
  `);

  console.log("\n=== onboarding_steps for MIS_SC_US (which steps marked completed) ===");
  console.log(await sql`
    SELECT step_key, status, completed_at
    FROM onboarding_steps
    WHERE client_id_code = 'MIS_SC_US' AND step_key IN ('amazon_import_attributes', 'amazon_import_catalog')
    ORDER BY step_key
  `);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
