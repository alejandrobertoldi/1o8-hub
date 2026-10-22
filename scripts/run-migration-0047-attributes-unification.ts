import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

// Direct port 5432 — DDL hangs on pgBouncer (port 6543).
// Filename `0047_attributes_unification.sql` has no prefix collision; this
// runner is its only companion (avoids the 0042 dual-runner class of bugs).
// max: 1 is required because the migration SQL uses BEGIN/COMMIT — postgres
// client raises UNSAFE_TRANSACTION if a multi-connection pool sends an
// explicit transaction block via sql.unsafe().
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running 0047_attributes_unification.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0047_attributes_unification.sql"),
    "utf8",
  );
  try {
    await sql.unsafe(text);
    console.log("  ✓ column_attributes → attributes (renamed)");
    console.log("  ✓ added: sc_label_multi, vc_label, sb_label, alr_label, clr_label, is_vp_flag, category_meta");
    console.log("  ✓ created: clr_unmatched_fields, master.is_vp");
    console.log("\nMigration complete.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
