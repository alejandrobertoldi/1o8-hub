import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");
  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0080_storefront_page_meta.sql",
    "utf8"
  );
  console.log("Applying 0080_storefront_page_meta.sql ...");
  await db.execute(sql.raw(migSql));

  const cols = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'storefront_pages'
      AND column_name = 'meta_description'
  `);
  console.log("Columns present:", cols);
  if ((cols as unknown[]).length !== 1) {
    throw new Error(`expected 1 new column, found ${(cols as unknown[]).length}`);
  }
  console.log("0080 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
