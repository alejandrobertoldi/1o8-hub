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
  console.log("Running 0064_calendar_events.sql...");
  const text = readFileSync(
    resolve(__dirname, "../drizzle/migrations/0064_calendar_events.sql"),
    "utf8"
  );
  await sql.unsafe(text);
  console.log("  ✓ calendar_event_type enum created");
  console.log("  ✓ calendar_events table created");

  const [{ count }] = await sql<{ count: string }[]>`
    SELECT count(*)::text AS count FROM calendar_events
  `;
  console.log(`  ✓ ${count} seed events present`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
