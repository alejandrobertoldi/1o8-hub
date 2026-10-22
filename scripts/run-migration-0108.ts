/**
 * Migration 0108: multiple users + subscription IDs + user limit
 * Run with: npx tsx scripts/run-migration-0108.ts
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
  console.log("Running migration 0108: shared_logins multi fields...");
  const text = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0108_shared_logins_multi.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("Migration 0108 applied successfully.");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0108 failed:", err);
  process.exit(1);
});
