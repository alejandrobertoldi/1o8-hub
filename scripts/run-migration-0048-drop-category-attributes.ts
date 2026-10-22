import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

// Direct port 5432 — DDL hangs on pgBouncer (port 6543).
// Filename `0048_drop_category_attributes.sql` has no prefix collision; this
// runner is its only companion (avoids the 0042 dual-runner class of bugs).
// max: 1 is required because the migration SQL uses BEGIN/COMMIT — postgres
// client raises UNSAFE_TRANSACTION if a multi-connection pool sends an
// explicit transaction block via sql.unsafe().
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running 0048_drop_category_attributes.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0048_drop_category_attributes.sql"),
    "utf8",
  );
  try {
    await sql.unsafe(text);
    console.log("  ✓ category_attributes table dropped");
    console.log("  ✓ Runner committed but NOT executed — defer until after prod burn-in.");
    console.log("\nMigration complete.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
