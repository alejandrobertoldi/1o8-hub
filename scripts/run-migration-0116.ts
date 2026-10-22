/**
 * Migration 0116: department lead flag on users.
 * Run with: npx tsx scripts/run-migration-0116.ts
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true, override: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running migration 0116: department lead...");
  const ddl = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0116_team_department_lead.sql"),
    "utf8"
  );
  await sql.unsafe(ddl);
  const [{ has_col, has_idx }] = await sql<{ has_col: boolean; has_idx: boolean }[]>`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'is_department_lead'
      ) AS has_col,
      EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_users_one_lead_per_department'
      ) AS has_idx
  `;
  if (!has_col || !has_idx) {
    throw new Error(`0116 verify failed: column=${has_col} index=${has_idx}`);
  }
  console.log("Migration 0116 applied successfully (is_department_lead + unique index).");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0116 failed:", err);
  process.exit(1);
});
