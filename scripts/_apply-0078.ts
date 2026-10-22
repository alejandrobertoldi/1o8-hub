import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");
  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0078_storefront.sql",
    "utf8"
  );
  console.log("Applying 0078_storefront.sql ...");
  await db.execute(sql.raw(migSql));

  const tables = await db.execute(sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('storefront_pages', 'storefront_modules')
    ORDER BY table_name
  `);
  console.log("Tables present:", tables);
  if ((tables as unknown[]).length !== 2) {
    throw new Error(`expected 2 tables, found ${(tables as unknown[]).length}`);
  }
  console.log("0078 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
