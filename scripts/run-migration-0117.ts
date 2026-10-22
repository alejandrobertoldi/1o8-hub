/**
 * Migration 0117: decoupled department lead (users.leads_department).
 * Run with: npx tsx scripts/run-migration-0117.ts
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
  console.log("Running migration 0117: decoupled department lead...");
  const ddl = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0117_team_department_lead_decoupled.sql"),
    "utf8"
  );
  await sql.unsafe(ddl);
  const [{ has_col, has_idx }] = await sql<{ has_col: boolean; has_idx: boolean }[]>`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'leads_department'
      ) AS has_col,
      EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_users_one_lead_per_department_v2'
      ) AS has_idx
  `;
  if (!has_col || !has_idx) {
    throw new Error(`0117 verify failed: column=${has_col} index=${has_idx}`);
  }
  console.log(
    "Migration 0117 applied successfully (leads_department + unique index v2)."
  );
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0117 failed:", err);
  process.exit(1);
});
