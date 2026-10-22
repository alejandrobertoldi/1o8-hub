import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  console.log("Running migration 0011_drive_folders_unique_path...");

  const sqlText = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0011_drive_folders_unique_path.sql"),
    "utf8"
  );

  await sql.unsafe(sqlText);

  console.log("  ✓ CREATE UNIQUE INDEX idx_drive_folders_unique_path (client_id_code, path)");
  console.log("\nMigration complete!");
  await sql.end();
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
