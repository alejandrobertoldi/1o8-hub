/**
 * One-shot migration runner that bypasses drizzle-kit (which hangs on the
 * Supabase pooler when the snapshot has drifted). Reads the SQL file and
 * executes it via the direct `postgres` driver.
 *
 * The repo's env file is .env.local at the parent repo root (worktrees do
 * not share it automatically). We connect via the direct port 5432 instead
 * of the pooler 6543 because pgBouncer hangs on DDL — pattern matches
 * scripts/run-migration-0042.ts.
 *
 * Run with: npx tsx scripts/apply-step8-staging-tables.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { config } from "dotenv";

// .env.local lives at the parent repo root; this script lives in a worktree
// at .worktrees/<branch>/scripts/, so .env.local is three levels up.
config({ path: resolve(__dirname, "../../../.env.local") });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL env var is required");
  const directUrl = url.replace(":6543/", ":5432/");

  const sqlPath = resolve(
    __dirname,
    "../drizzle/migrations/sql/2026_04_28_step8_staging_tables.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");

  const client = postgres(directUrl, { max: 1, prepare: false, ssl: "require" });
  try {
    console.log(`Applying ${sqlPath}…`);
    await client.unsafe(sql);
    console.log("Done. Tables created (or already existed).");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
