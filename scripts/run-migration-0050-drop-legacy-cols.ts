import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });

async function main() {
  console.log("Running 0050_drop_legacy_cols.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0050_drop_legacy_cols.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("  ✓ master_row dropped");
  console.log("  ✓ client_requirements dropped");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
