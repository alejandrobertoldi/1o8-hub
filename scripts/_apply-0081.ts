import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");
  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0081_storefront_versions.sql",
    "utf8"
  );
  console.log("Applying 0081_storefront_versions.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'storefront_versions'
  `);
  const col = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'storefront_pages'
      AND column_name = 'version_id'
  `);
  const orphans = await db.execute(sql`
    SELECT count(*)::int AS n FROM storefront_pages WHERE version_id IS NULL
  `);
  console.log("storefront_versions table:", tbl);
  console.log("storefront_pages.version_id:", col);
  console.log("pages still missing version_id:", orphans);
  if ((tbl as unknown[]).length !== 1) throw new Error("storefront_versions table missing");
  if ((col as unknown[]).length !== 1) throw new Error("version_id column missing");
  const n = (orphans as unknown as Array<{ n: number }>)[0]?.n ?? -1;
  if (n !== 0) throw new Error(`expected 0 pages without version_id, found ${n}`);
  console.log("0081 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
