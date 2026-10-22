import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

const directUrl = process.env.DATABASE_URL!.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  const code = process.argv[2] || "MIS_SC_US";
  const rows = await sql<Array<{ client_id_code: string; client_name: string | null; raw_data: Record<string, string> | null }>>`
    SELECT client_id_code, client_name, raw_data
    FROM aac WHERE client_id_code = ${code} LIMIT 1
  `;
  console.log(JSON.stringify(rows[0] ?? null, null, 2));
  // Also surface any "manufacturer"-looking keys in master.raw_column_values across this client.
  const mfg = await sql<Array<{ key: string; n: number }>>`
    SELECT k.key, COUNT(*)::int AS n
    FROM master m, LATERAL jsonb_object_keys(m.raw_column_values) AS k(key)
    WHERE m.client_id_code = ${code}
      AND k.key ILIKE '%manufactur%'
    GROUP BY k.key
    ORDER BY n DESC
  `;
  console.log("\nKeys matching '%manufactur%' in master.raw_column_values:");
  console.log(mfg.length === 0 ? "  (none)" : mfg.map(r => `  ${r.n}\t${r.key}`).join("\n"));
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
