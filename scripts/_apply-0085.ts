import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0085_redshift_archive_catalog.sql",
    "utf8"
  );
  console.log("Applying 0085_redshift_archive_catalog.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('redshift_archive_catalog', 'redshift_archive_account_stats')
    ORDER BY table_name
  `);
  console.log("tables:", tbl);
  if ((tbl as unknown[]).length !== 2) throw new Error("expected 2 tables");
  console.log("0085 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
