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
  console.log("Running 0049_hub_label.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0049_hub_label.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("  ✓ attributes.hub_label added");
  await sql.end();
}

main().catch((e) => { console.error("Migration failed:", e); process.exit(1); });
