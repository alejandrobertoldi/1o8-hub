import { config } from "dotenv";
config({ path: ".env.local" });

// Set once the DDL below has actually committed, so the catch handler can
// tell "the migration failed" apart from "the migration succeeded and a
// verification query afterwards failed" — two very different situations at
// the highest-stakes moment this script will ever run.
let ddlCommitted = false;

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * drizzle wraps driver errors in a DrizzleQueryError whose `message` is the
 * entire failed query and whose `cause` holds the real PostgresError (with the
 * SQLSTATE `code`). Reading `.code` off the top level silently yields
 * undefined — which is what defeated the first retry attempt. Unwrap.
 */
function pgError(e: unknown): { code?: string; message: string } {
  const cause = (e as { cause?: unknown })?.cause;
  const src = (cause ?? e) as { code?: string; message?: string };
  return { code: src?.code, message: src?.message ?? String(e) };
}

async function main() {
  const { db } = await import("@/lib/db");
  const { sql } = await import("drizzle-orm");
  const fs = await import("fs");

  const migSql = fs.default.readFileSync(
    "./drizzle/migrations/0087_team_calendar_time_off.sql",
    "utf8"
  );

  // `ALTER TABLE users ADD COLUMN` needs an ACCESS EXCLUSIVE lock, which
  // conflicts with the ACCESS SHARE locks every auth/session read of `users`
  // holds. Without a lock_timeout the ALTER sits in the lock queue — and,
  // worse, every read arriving AFTER it queues behind it, so production auth
  // stalls until the server's 2min statement_timeout kills us. That is
  // exactly what the first attempt did.
  //
  // With lock_timeout the failure mode inverts: we either win a quiet moment
  // and finish in milliseconds (adding a nullable column is metadata-only),
  // or we abort in 3s having blocked nothing, and try again. NOT a raised
  // statement_timeout — that would lengthen the stall, not shorten it.
  //
  // SET LOCAL is scoped to the implicit transaction below, so it reverts on
  // its own and leaves no session state behind.
  const guardedSql = `SET LOCAL lock_timeout = '3s';\n--> statement-breakpoint\n${migSql}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Applying 0087_team_calendar_time_off.sql (attempt ${attempt}/${MAX_ATTEMPTS}) ...`);
    try {
      // Zero bind params -> the `postgres` driver's simple query protocol runs
      // this whole multi-statement string in ONE implicit transaction, so by
      // the time `execute` resolves the migration has already committed.
      // Everything below is verification only.
      await db.execute(sql.raw(guardedSql));
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
              `Nothing was applied and nothing was blocked. Retry when traffic is lower, ` +
              `or stop any local dev server pointed at this database first.`
          );
        }
        throw e;
      }
      console.log(
        `  attempt ${attempt} could not get the lock on "users" within 3s ` +
          `(SQLSTATE ${code}) — rolled back, nothing blocked. Retrying in ${RETRY_DELAY_MS / 1000}s ...`
      );
      await sleep(RETRY_DELAY_MS);
    }
  }

  const tbls = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('time_off_requests', 'public_holidays')
  `);
  console.log("new tables:", tbls);
  if ((tbls as unknown[]).length !== 2) {
    throw new Error("time_off_requests and/or public_holidays table missing");
  }

  const col = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'country_code'
  `);
  console.log("users.country_code column:", col);
  if ((col as unknown[]).length !== 1) {
    throw new Error("users.country_code column missing");
  }

  const con = await db.execute(sql`
    SELECT conname FROM pg_constraint
    WHERE conname = 'time_off_no_overlap_per_user'
  `);
  console.log("time_off_no_overlap_per_user constraint:", con);
  if ((con as unknown[]).length !== 1) {
    throw new Error("time_off_no_overlap_per_user constraint missing");
  }

  console.log("0087 applied OK.");
  process.exit(0);
}
main().catch((e) => {
  // Print the message, NOT the whole error object — the postgres driver
  // attaches the full migration text to it, which buries the one line that
  // matters under 50 lines of echoed SQL.
  const { code, message } = pgError(e);
  console.error(`\nFAILED${code ? ` (SQLSTATE ${code})` : ""}: ${message}`);
  if (ddlCommitted) {
    console.error(
      "\nDDL COMMITTED SUCCESSFULLY. A verification query then failed. " +
        "Do NOT rerun this script. Check whether the objects already exist first."
    );
  }
  process.exit(1);
});
