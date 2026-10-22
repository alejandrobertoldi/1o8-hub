/**
 * Migration 0118: department-leads junction + users.departments array.
 * Run with: npx tsx scripts/run-migration-0118.ts
 * DO NOT run without an explicit per-action OK — this writes production data.
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
  console.log("Running migration 0118: multi-dept junction + array...");
  const ddl = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0118_team_multi_dept.sql"),
    "utf8"
  );
  await sql.unsafe(ddl);
  const [{ has_table, has_idx, has_col, lead_rows }] = await sql<
    { has_table: boolean; has_idx: boolean; has_col: boolean; lead_rows: number }[]
  >`
    SELECT
      EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_name = 'user_department_leads') AS has_table,
      EXISTS (SELECT 1 FROM pg_indexes
              WHERE indexname = 'idx_user_department_leads_one_per_dept') AS has_idx,
      EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'users' AND column_name = 'departments') AS has_col,
      (SELECT COUNT(*)::int FROM user_department_leads) AS lead_rows
  `;
  if (!has_table || !has_idx || !has_col || lead_rows < 4) {
    throw new Error(
      `0118 verify failed: table=${has_table} idx=${has_idx} col=${has_col} lead_rows=${lead_rows}`
    );
  }
  console.log(`Migration 0118 applied successfully (lead_rows=${lead_rows}).`);
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0118 failed:", err);
  process.exit(1);
});
