import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");
  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0077_seo_item_highlight.sql",
    "utf8"
  );
  console.log("Applying 0077_seo_item_highlight.sql ...");
  await db.execute(sql.raw(migSql));

  const cols = await db.execute(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE (table_name = 'seo_listings' AND column_name = 'item_highlight')
       OR (table_name = 'master' AND column_name = 'item_highlight')
    ORDER BY table_name
  `);
  console.log("Columns present:", cols);
  if ((cols as unknown[]).length !== 2) {
    throw new Error(`expected 2 columns, found ${(cols as unknown[]).length}`);
  }
  console.log("0077 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
