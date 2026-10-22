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
  console.log("Running 0063_attributes_master_junctions.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0063_attributes_master_junctions.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("  ✓ idx_am_hub_label_ci unique index created");
  console.log("  ✓ attribute_category_index table created");
  console.log("  ✓ attribute_client_provenance table created");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
