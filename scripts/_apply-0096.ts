import { config } from "dotenv";
config({ path: ".env.local" });

let ddlCommitted = false;

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 4000;

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
    console.warn(
      "WARNING: DIRECT_DATABASE_URL is not set — falling back to DATABASE_URL."
    );
  }

  const sql = postgres(url, { max: 1 });

  try {
    const migSql = fs.default.readFileSync(
      "./drizzle/migrations/0096_aplus2_sets_unique_content_type.sql",
      "utf8"
    );
    const guardedSql = `SET LOCAL lock_timeout = '3s';\n${migSql}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(
        `Applying 0096_aplus2_sets_unique_content_type.sql (attempt ${attempt}/${MAX_ATTEMPTS}) ...`
      );
      try {
        await sql.unsafe(guardedSql);
        ddlCommitted = true;
        console.log(`DDL committed on attempt ${attempt}.`);
        break;
      } catch (e) {
        const { code, message } = pgError(e);
        const retryable = code === "55P03" || code === "57014";
        if (!retryable || attempt === MAX_ATTEMPTS) {
          console.error(
            `\nAttempt ${attempt} failed${code ? ` (SQLSTATE ${code})` : ""}: ${message}`
          );
          throw e;
        }
        console.log(
          `  attempt ${attempt} could not get the lock within 3s ` +
            `(SQLSTATE ${code}) — retrying in ${RETRY_DELAY_MS / 1000}s ...`
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    const keys = await sql`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.aplus2_sets'::regclass
        AND contype = 'u'
      ORDER BY conname
    `;
    console.log("unique keys:", keys);
    const defs = keys.map((r) => String(r.def));
    if (!defs.some((d) => d.includes("content_type"))) {
      throw new Error("aplus2_sets unique key does not include content_type");
    }
    if (keys.some((r) => String(r.conname) === "aplus2_sets_client_marketplace_scope_key")) {
      throw new Error("old unique key aplus2_sets_client_marketplace_scope_key still present");
    }

    console.log("0096 applied OK.");
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.exit(0);
}

main().catch((e) => {
  const { code, message } = pgError(e);
  console.error(`\nFAILED${code ? ` (SQLSTATE ${code})` : ""}: ${message}`);
  if (ddlCommitted) {
    console.error(
      "\nDDL COMMITTED SUCCESSFULLY. A verification query then failed. Do NOT rerun."
    );
  }
  process.exit(1);
});
