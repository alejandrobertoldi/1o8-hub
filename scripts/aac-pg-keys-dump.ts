import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

const directUrl = (process.env.DATABASE_URL || "").replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  const rows = await sql<{ key: string; cnt: number }[]>`
    SELECT key, COUNT(*)::int AS cnt
    FROM aac, jsonb_object_keys(raw_data) AS key
    WHERE jsonb_typeof(raw_data) = 'object'
    GROUP BY key
    ORDER BY key
  `;
  console.log("count_keys:", rows.length);
  for (const r of rows) console.log(`${r.key}\t${r.cnt}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
