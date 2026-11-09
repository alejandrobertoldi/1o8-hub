/**
 * Replaces the LOCAL database's data with a copy of production (read-only on
 * production), to validate changes against real data. Uses copy-db.ts with
 * production as the source and the local Postgres (npm run db:local) as the
 * target. Refuses any target that isn't localhost.
 *
 *   npm run db:pull:prod
 *
 * Run `npm run db:push` first if the local schema is behind (tables that only
 * exist in production are skipped). Everything local is overwritten: local
 * test hours, estimates, etc. are lost.
 */
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const source = process.env.SUPABASE_DATABASE_URL;
const target = process.env.DATABASE_URL;
if (!source) {
  console.error("SUPABASE_DATABASE_URL is missing from .env.local");
  process.exit(1);
}
if (!target || !/@(localhost|127\.0\.0\.1)[:/]/.test(target)) {
  console.error("DATABASE_URL in .env.local must be the local Postgres (localhost); refusing to overwrite anything else.");
  process.exit(1);
}
console.log("Copying production → local (local data will be replaced)…");
const r = spawnSync("npx", ["tsx", "scripts/local/copy-db.ts", "--replace"], {
  stdio: "inherit",
  env: { ...process.env, SOURCE_DATABASE_URL: source, TARGET_DATABASE_URL: target },
});
process.exit(r.status ?? 1);
