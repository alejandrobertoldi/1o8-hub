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
  console.log("Running migration 0041_google_sheet_template_requests...");

  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0041_google_sheet_template_requests.sql"),
    "utf8"
  );

  // Execute whole file; postgres.js handles multi-statement SQL and comments natively.
  await sql.unsafe(sqlText);

  console.log("  ✓ ALTER TABLE attribute_template_requests (8 columns added)");
  console.log("  ✓ UPDATE attribute_template_requests (legacy rows marked)");
  console.log("  ✓ CREATE INDEX idx_atr_client_status");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
