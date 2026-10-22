/**
 * Migration 0114: Amazon product reviews store
 * (product_reviews, review_asin_status, review_topic_snapshots,
 *  review_rating_history, review_sync_runs).
 * Run with: npx tsx scripts/run-migration-0114.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true, override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

// Drizzle DDL goes through the direct port; the pooler hangs on DDL.
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running migration 0114: product reviews store...");
  const ddl = readFileSync(resolve(process.cwd(), "drizzle/migrations/0114_product_reviews.sql"), "utf8");
  await sql.unsafe(ddl);
  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM information_schema.tables
    WHERE table_name IN ('product_reviews','review_asin_status','review_topic_snapshots','review_rating_history','review_sync_runs')
  `;
  console.log(`Migration 0114 applied successfully (${count}/5 tables present).`);
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0114 failed:", err);
  process.exit(1);
});
