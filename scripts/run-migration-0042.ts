import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

// Use direct connection (port 5432) instead of pooler (6543) — DDL hangs on pgBouncer
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running migration 0042_monthly_report_config...");

  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0042_monthly_report_config.sql"),
    "utf8",
  );

  await sql.unsafe(sqlText);

  console.log("  ✓ CREATE TABLE report_section_config");
  console.log("  ✓ CREATE INDEX idx_rsc_scope");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
