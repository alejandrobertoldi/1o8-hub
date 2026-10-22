// Local-only: runs a real Postgres 17 server (embedded-postgres binaries,
// no Docker). Data persists in ./.data/pg. Keep it running while you use
// `npm run dev`. Production uses Supabase instead (DATABASE_URL).
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

const PORT = 54330;
const DATABASE = "hub";
const dataDir = path.resolve(".data/pg");
const firstRun = !fs.existsSync(path.join(dataDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port: PORT, persistent: true });

async function main() {
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) await pg.createDatabase(DATABASE);
  console.log(`Local Postgres ready -> postgres://postgres:postgres@localhost:${PORT}/${DATABASE}`);
}
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
main().catch(async (e) => { console.error(e); await pg.stop().catch(() => {}); process.exit(1); });
