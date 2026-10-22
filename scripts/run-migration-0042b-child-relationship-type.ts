import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

// Use direct connection (port 5432) — DDL hangs on pgBouncer.
// Note: this migration file shares its 0042 prefix with 0042_monthly_report_config.sql,
// which already has scripts/run-migration-0042.ts. This runner is the missing companion
// for the child_relationship_type ALTER. Idempotent (IF NOT EXISTS).
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running 0042_child_relationship_type.sql...");
  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0042_child_relationship_type.sql"),
    "utf8",
  );
  await sql.unsafe(sqlText);
  console.log("  ✓ ADD COLUMN IF NOT EXISTS master.child_relationship_type varchar(20)");
  console.log("  ✓ CREATE INDEX IF NOT EXISTS idx_master_child_relationship_type");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
