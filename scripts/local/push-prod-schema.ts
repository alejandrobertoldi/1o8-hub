/**
 * Applies schema.ts to the online (Supabase) database before a release.
 * Reads SUPABASE_DATABASE_URL from .env.local and uses Supabase's session
 * pooler (port 5432), which schema changes need. drizzle-kit stops and asks
 * before anything destructive (dropping/renaming columns, truncating), so a
 * prompt means: stop and look before answering.
 *
 *   npm run db:push:prod
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local" });
const url = process.env.SUPABASE_DATABASE_URL;
if (!url) {
  console.error("SUPABASE_DATABASE_URL is missing from .env.local");
  process.exit(1);
}
const session = url.replace(":6543/", ":5432/");
const r = spawnSync("npx", ["drizzle-kit", "push"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: session } });
process.exit(r.status ?? 1);
