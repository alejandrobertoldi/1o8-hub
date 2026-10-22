// Applies 0131 (inventory_capacity_limits table). PROD WRITE — run only with Manu's explicit OK.
import { config } from "dotenv";
config({ path: ".env.local" });

let ddlCommitted = false;

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 4000;
const MIGRATION = "0131_inventory_capacity_limits.sql";

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
        console.log(
          `  attempt ${attempt} could not get the lock within 3s ` +
            `(SQLSTATE ${code}) — retrying in ${RETRY_DELAY_MS / 1000}s ...`,
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    const cols = await sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'inventory_capacity_limits'
    `;
    const names = cols.map((c) => String(c.column_name)).sort().join(",");
    if (names !== "client_id_code,limit_ft3,month,set_at,set_by,storage_type") throw new Error(`unexpected columns: ${names}`);
    const chk = await sql`SELECT conname FROM pg_constraint WHERE conname LIKE 'inventory_capacity_limits_%'`;
    if (chk.length !== 3) throw new Error(`expected 3 constraints, found ${chk.length}`);
    console.log("0131 applied OK.");
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
