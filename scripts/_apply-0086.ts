import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0086_redshift_archive_runs.sql",
    "utf8"
  );
  console.log("Applying 0086_redshift_archive_runs.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'redshift_archive_runs'
  `);
  console.log("redshift_archive_runs table:", tbl);
  if ((tbl as unknown[]).length !== 1) throw new Error("redshift_archive_runs table missing");
  console.log("0086 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
