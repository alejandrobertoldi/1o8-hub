import { config } from "dotenv";
config({ path: ".env.local" });

let ddlCommitted = false;

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 4000;
const MIGRATION = "0126_inventory_final_rec.sql";

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

    const settingsCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'inventory_rec_settings'
    `;
    const names = settingsCols.map((c) => String(c.column_name));
    for (const col of ["method", "recent_days", "seasonal_start", "seasonal_end", "uplift_pct", "pct_90d"]) {
      if (!names.includes(col)) throw new Error(`inventory_rec_settings.${col} missing`);
    }
    for (const table of ["inventory_rec_overrides", "inventory_rec_snapshots", "inventory_rec_snapshot_rows"]) {
      const c = await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = ${table}`;
      if (c[0].n === 0) throw new Error(`${table} missing`);
    }
    const uq = await sql`
      SELECT indexname FROM pg_indexes WHERE indexname = 'inventory_rec_overrides_client_sku_uq'
    `;
    if (uq.length !== 1) throw new Error("inventory_rec_overrides_client_sku_uq missing");
    console.log("0126 applied OK.");
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
