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
  console.log("Running 0061_hub_features.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0061_hub_features.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("  ✓ hub_feature_status enum created");
  console.log("  ✓ hub_features table created");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
