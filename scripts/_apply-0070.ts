import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");
  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0070_calendar_pto.sql",
    "utf8"
  );
  for (const stmt of migSql.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(sql.raw(stmt + ";"));
  }
  console.log("Migration 0070 applied");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
