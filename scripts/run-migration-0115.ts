/**
 * Migration 0115: team department + multiple job titles.
 * Run with: npx tsx scripts/run-migration-0115.ts
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
  console.log("Running migration 0115: team department + job titles...");
  const ddl = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0115_team_department_job_titles.sql"),
    "utf8"
  );
  await sql.unsafe(ddl);
  const [{ has_dept, has_titles, has_enum }] = await sql<
    { has_dept: boolean; has_titles: boolean; has_enum: boolean }[]
  >`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'department'
      ) AS has_dept,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'job_titles'
      ) AS has_titles,
      EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'team_department'
      ) AS has_enum
  `;
  if (!has_dept || !has_titles || !has_enum) {
    throw new Error(
      `0115 verify failed: department=${has_dept} job_titles=${has_titles} enum=${has_enum}`
    );
  }
  console.log("Migration 0115 applied successfully (department + job_titles + enum).");
  await sql.end();
}

main().catch((err) => {
  console.error("Migration 0115 failed:", err);
  process.exit(1);
});
