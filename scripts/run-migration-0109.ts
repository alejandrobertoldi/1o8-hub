/**
 * Migration 0109: Q4 holiday deal planning table
 * Run with: npx tsx scripts/run-migration-0109.ts
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
  console.log("Running migration 0109: holiday_deal_plans...");
  const text = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0109_holiday_deal_plans.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("Migration 0109 applied successfully.");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0109 failed:", err);
  process.exit(1);
});
