import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0083_time_entries.sql",
    "utf8"
  );
  console.log("Applying 0083_time_entries.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'time_entries'
  `);
  console.log("time_entries table:", tbl);
  if ((tbl as unknown[]).length !== 1) throw new Error("time_entries table missing");
  console.log("0083 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
