import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0084_intentwise_accounts.sql",
    "utf8"
  );
  console.log("Applying 0084_intentwise_accounts.sql ...");
  await db.execute(sql.raw(migSql));

  const tbl = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'intentwise_accounts'
  `);
  console.log("intentwise_accounts table:", tbl);
  if ((tbl as unknown[]).length !== 1) throw new Error("intentwise_accounts table missing");

  // stopped_at is the whole point of the lifecycle gate — verify it landed.
  const col = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'intentwise_accounts'
      AND column_name = 'stopped_at'
  `);
  if ((col as unknown[]).length !== 1) throw new Error("intentwise_accounts.stopped_at missing");

  console.log("0084 applied OK.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
