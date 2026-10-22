/**
 * Migration 0120: Case Study Kit (format, stage, owner, sent_at, metrics; unique (client, format)).
 * Run with: cd /Users/manu/MFHub && npx tsx .worktrees/thread-ab-case-study/scripts/run-migration-0120.ts
 * DO NOT run without an explicit per-action OK — this changes the production schema.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
import postgres from "postgres";

config({ path: resolve(process.cwd(), ".env.local"), quiet: true, override: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = postgres(process.env.DATABASE_URL.replace(":6543/", ":5432/"), { ssl: "require", max: 1 });

async function main() {
  const ddl = readFileSync(resolve(__dirname, "../drizzle/migrations/0120_case_study_kit.sql"), "utf8");
  await sql.unsafe(ddl);
  const [v] = await sql<{ cols: number; uniq: boolean; old_uniq: number }[]>`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.columns WHERE table_name = 'case_studies'
         AND column_name IN ('format','stage','owner_id','sent_at','metrics')) AS cols,
      EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'case_studies_client_format_key') AS uniq,
      (SELECT COUNT(*)::int FROM pg_constraint WHERE conrelid = 'case_studies'::regclass AND contype = 'u'
         AND pg_get_constraintdef(oid) = 'UNIQUE (client_id_code)') AS old_uniq`;
  if (v.cols !== 5 || !v.uniq || v.old_uniq !== 0) throw new Error(`0120 verify failed: ${JSON.stringify(v)}`);
  console.log("Migration 0120 applied successfully.", v);
  await sql.end();
}
main().catch((err) => { console.error("Migration 0120 failed:", err); process.exit(1); });
