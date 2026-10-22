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
    // Enum ADD VALUE cannot always share a transaction with UPDATE that uses
    // the new label. Apply as three separate commits.
    for (const label of ["super_admin", "owner"] as const) {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(
          `ADD VALUE '${label}' (attempt ${attempt}/${MAX_ATTEMPTS}) ...`
        );
        try {
          await sql.unsafe(
            `SET lock_timeout = '3s'; ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS '${label}';`
          );
          console.log(`  '${label}' present.`);
          break;
        } catch (e) {
          const { code, message } = pgError(e);
          const retryable = code === "55P03" || code === "57014";
          if (!retryable || attempt === MAX_ATTEMPTS) {
            console.error(
              `\nFailed adding '${label}'${code ? ` (SQLSTATE ${code})` : ""}: ${message}`
            );
            throw e;
          }
          await sleep(RETRY_DELAY_MS);
        }
      }
    }

    console.log("Migrating is_super_admin=true → role=super_admin ...");
    const migrated = await sql`
      UPDATE "users"
      SET "role" = 'super_admin'
      WHERE "is_super_admin" = true
        AND "role" NOT IN ('owner', 'super_admin')
      RETURNING id, email
    `;
    console.log(`  migrated ${migrated.length} row(s):`, migrated);
    ddlCommitted = true;

    const enums = await sql`
      SELECT enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'user_role'
      ORDER BY enumsortorder
    `;
    const labels = enums.map((r) => r.enumlabel as string);
    console.log("user_role labels:", labels);
    for (const need of ["super_admin", "owner"]) {
      if (!labels.includes(need)) {
        throw new Error(`missing enum label ${need}`);
      }
    }

    console.log("0092 applied OK.");
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
      "\nData UPDATE may have committed. Check users.role before rerunning."
    );
  }
  process.exit(1);
});
