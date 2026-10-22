/**
 * Migration 0107: shared login activation/subscription fields + allowed users
 * Run with: npx tsx scripts/run-migration-0107.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running migration 0107: shared_logins fields...");
  const text = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0107_shared_logins_fields.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("Migration 0107 applied successfully.");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0107 failed:", err);
  process.exit(1);
});
