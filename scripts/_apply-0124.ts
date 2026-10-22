import { config } from "dotenv";
config({ path: ".env.local" });

let ddlCommitted = false;

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 4000;
const MIGRATION = "0124_seo_revisions.sql";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pgError(e: unknown): { code?: string; message: string } {
  const cause = (e as { cause?: unknown })?.cause;
  const src = (cause ?? e) as { code?: string; message?: string };
  return { code: src?.code, message: src?.message ?? String(e) };
}

async function main() {
  const postgres = (await import("postgres")).default;
  const fs = await import("fs");

  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither DIRECT_DATABASE_URL nor DATABASE_URL is set");
  if (!process.env.DIRECT_DATABASE_URL) {
    console.warn("WARNING: DIRECT_DATABASE_URL is not set — falling back to DATABASE_URL.");
  }

  const sql = postgres(url, { max: 1 });

  try {
    const migSql = fs.default.readFileSync(`./drizzle/migrations/${MIGRATION}`, "utf8");
    const guardedSql = `SET LOCAL lock_timeout = '3s';\n${migSql}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`Applying ${MIGRATION} (attempt ${attempt}/${MAX_ATTEMPTS}) ...`);
      try {
        await sql.unsafe(guardedSql);
        ddlCommitted = true;
        console.log(`DDL committed on attempt ${attempt}.`);
        break;
      } catch (e) {
        const { code, message } = pgError(e);
        const retryable = code === "55P03" || code === "57014";
        if (!retryable || attempt === MAX_ATTEMPTS) {
          console.error(`\nAttempt ${attempt} failed${code ? ` (SQLSTATE ${code})` : ""}: ${message}`);
          throw e;
        }
        console.log(`  lock not acquired within 3s (SQLSTATE ${code}) — retrying in ${RETRY_DELAY_MS / 1000}s ...`);
        await sleep(RETRY_DELAY_MS);
      }
    }

    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('seo_revisions', 'seo_revision_events', 'seo_revision_comments', 'seo_revision_pushes')
    `;
    if (tables.length !== 4) throw new Error(`expected 4 tables, found ${tables.length}`);
    const idx = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'seo_revisions'
        AND indexname IN ('uq_seo_revisions_one_open', 'uq_seo_revisions_one_current', 'uq_seo_revisions_project_number')
    `;
    if (idx.length !== 3) throw new Error(`expected 3 seo_revisions unique indexes, found ${idx.length}`);
    console.log("0124 applied OK: 4 tables, 3 unique indexes.");
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.exit(0);
}

main().catch((e) => {
  const { code, message } = pgError(e);
  console.error(`\nFAILED${code ? ` (SQLSTATE ${code})` : ""}: ${message}`);
  if (ddlCommitted) {
    console.error("\nDDL COMMITTED SUCCESSFULLY. A verification query then failed. Do NOT rerun.");
  }
  process.exit(1);
});
