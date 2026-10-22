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
  console.log("Running migration 0045_master_unique_client_sku...");

  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0045_master_unique_client_sku.sql"),
    "utf8",
  );

  // Single transaction so the dedup + unique-index add is all-or-nothing.
  await sql.begin(async (tx) => {
    await tx.unsafe(sqlText);
  });

  console.log("  ✓ duplicate (client_id_code, sku) rows deduped via FK rewrite");
  console.log("  ✓ CREATE UNIQUE INDEX uq_master_client_sku");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
