import { config } from "dotenv";
config({ path: ".env.local" });

// Set once the DDL has actually committed, so the catch handler can tell
// "the migration failed" apart from "the migration succeeded and a
// verification query afterwards failed".
let ddlCommitted = false;

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Unwraps a driver error's SQLSTATE. Kept from _apply-0087.ts: drizzle wraps
 * driver errors in a DrizzleQueryError whose `cause` holds the real
 * PostgresError, so reading `.code` off the top level silently yields
 * undefined — which defeated an entire retry build. This script talks to
 * `postgres` directly (see below) so the code is usually top-level, but the
 * unwrap is harmless and survives a future refactor back to drizzle.
 */
function pgError(e: unknown): { code?: string; message: string } {
  const cause = (e as { cause?: unknown })?.cause;
  const src = (cause ?? e) as { code?: string; message?: string };
  return { code: src?.code, message: src?.message ?? String(e) };
}

async function main() {
  const postgres = (await import("postgres")).default;
  const fs = await import("fs");

  // DATABASE_URL is the Supavisor TRANSACTION pooler (port 6543), which is
  // the wrong endpoint for DDL — it has no stable session and it dropped one
  // 0087 attempt mid-run with CONNECTION_CLOSED. Prefer the direct
  // connection (Supabase dashboard -> Project Settings -> Database ->
  // Direct connection). This is why the script uses `postgres` directly
  // instead of importing @/lib/db, which is hardwired to DATABASE_URL.
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither DIRECT_DATABASE_URL nor DATABASE_URL is set");
  if (!process.env.DIRECT_DATABASE_URL) {
    console.warn(
      "WARNING: DIRECT_DATABASE_URL is not set — falling back to DATABASE_URL, " +
        "which is the transaction pooler. DDL over the pooler is what dropped " +
        "an 0087 attempt with CONNECTION_CLOSED. Ask Manu for the direct string."
    );
  }

  const sql = postgres(url, { max: 1 });

  try {
    const migSql = fs.default.readFileSync(
      "./drizzle/migrations/0088_user_residence_timezone.sql",
      "utf8"
    );

    // `ALTER TABLE users ADD COLUMN` needs an ACCESS EXCLUSIVE lock, which
    // conflicts with the ACCESS SHARE locks every auth/session read of
    // `users` holds. Without a lock_timeout the ALTER sits in the lock queue
    // — and every read arriving AFTER it queues behind it, so production auth
    // stalls until the server's 2min statement_timeout kills us. That is
    // exactly what 0087's first attempt did.
    //
    // With lock_timeout the failure mode inverts: we either win a quiet
    // moment and finish in microseconds (adding a nullable column is
    // metadata-only), or we abort in 3s having blocked nothing, and retry.
    // NEVER a raised statement_timeout — that lengthens the stall.
    //
    // SET LOCAL is scoped to the implicit transaction, so it reverts on its
    // own and leaves no session state behind.
    const guardedSql = `SET LOCAL lock_timeout = '3s';\n${migSql}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(
        `Applying 0088_user_residence_timezone.sql (attempt ${attempt}/${MAX_ATTEMPTS}) ...`
      );
      try {
        // Zero bind params -> simple query protocol -> the whole
        // multi-statement string runs in ONE implicit transaction, so by the
        // time this resolves the migration has committed. Everything below
        // is verification only.
        await sql.unsafe(guardedSql);
        ddlCommitted = true;
        console.log(`DDL committed on attempt ${attempt}.`);
        break;
      } catch (e) {
        // 55P03 lock_not_available — our lock_timeout fired. Nothing was
        // committed (single implicit transaction), nothing was blocked.
        // 57014 statement_timeout — belt and braces; same clean-rollback shape.
        const { code, message } = pgError(e);
        const retryable = code === "55P03" || code === "57014";
        if (!retryable || attempt === MAX_ATTEMPTS) {
          console.error(
            `\nAttempt ${attempt} failed${code ? ` (SQLSTATE ${code})` : ""}: ${message}`
          );
          if (retryable) {
            console.error(
              `\nAll ${MAX_ATTEMPTS} attempts lost the race for the lock on "users". ` +
                `Nothing was applied and nothing was blocked. Retry when traffic is ` +
                `lower, or stop any local dev server pointed at this database first.`
            );
          }
          throw e;
        }
        console.log(
          `  attempt ${attempt} could not get the lock on "users" within 3s ` +
            `(SQLSTATE ${code}) — rolled back, nothing blocked. Retrying in ${
              RETRY_DELAY_MS / 1000
            }s ...`
        );
        await sleep(RETRY_DELAY_MS);
      }
    }

    const col = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'residence_timezone'
    `;
    console.log("users.residence_timezone column:", col);
    if (col.length !== 1) {
      throw new Error("users.residence_timezone column missing");
    }
    if (col[0].is_nullable !== "YES") {
      throw new Error("users.residence_timezone must be nullable");
    }

    // country_code must be untouched — the design REUSES it (D-D).
    const cc = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'users'
        AND column_name = 'country_code'
    `;
    if (cc.length !== 1) {
      throw new Error("users.country_code went missing — 0088 must be additive");
    }

    console.log("0088 applied OK.");
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.exit(0);
}

main().catch((e) => {
  // Print the message, NOT the whole error object — the postgres driver
  // attaches the failed statement to it, which buries the one line that
  // matters.
  const { code, message } = pgError(e);
  console.error(`\nFAILED${code ? ` (SQLSTATE ${code})` : ""}: ${message}`);
  if (ddlCommitted) {
    console.error(
      "\nDDL COMMITTED SUCCESSFULLY. A verification query then failed. " +
        "Do NOT rerun this script. Check whether the column already exists first."
    );
  }
  process.exit(1);
});
