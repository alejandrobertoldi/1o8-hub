/**
 * Exploratory: dump distinct CLR attribute keys + value samples for a client.
 * Useful when adding new entries to the CLR→bqName alias table — surfaces
 * what real keys the source data carries before you write a regex.
 *
 * Usage:
 *   npx tsx scripts/list-clr-keys.ts MIS_SC_US > /tmp/clr-keys.txt
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  const clientIdCode = process.argv[2] || "MIS_SC_US";
  console.log(`# Distinct CLR attribute keys for ${clientIdCode}\n`);

  // Try staging first; fall back to master.raw_column_values which keeps the
  // original CLR keys after a successful merge wipes staging.
  const stagedCount = await sql<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM staged_clr_products WHERE client_id_code = ${clientIdCode}
  `;
  const useStaging = (stagedCount[0]?.n ?? 0) > 0;
  console.log(`# source: ${useStaging ? "staged_clr_products" : "master.raw_column_values"}\n`);

  const keyRows = useStaging
    ? await sql<Array<{ key: string; n_rows: number; sample: string | null }>>`
        SELECT
          k.key,
          COUNT(*)::int AS n_rows,
          MAX(CASE
            WHEN p.attributes->>k.key IS NOT NULL
             AND p.attributes->>k.key <> ''
            THEN p.attributes->>k.key
          END) AS sample
        FROM staged_clr_products p,
             LATERAL jsonb_object_keys(p.attributes) AS k(key)
        WHERE p.client_id_code = ${clientIdCode}
        GROUP BY k.key
        ORDER BY n_rows DESC, k.key
      `
    : await sql<Array<{ key: string; n_rows: number; sample: string | null }>>`
        SELECT
          k.key,
          COUNT(*)::int AS n_rows,
          MAX(CASE
            WHEN m.raw_column_values->>k.key IS NOT NULL
             AND m.raw_column_values->>k.key <> ''
            THEN m.raw_column_values->>k.key
          END) AS sample
        FROM master m,
             LATERAL jsonb_object_keys(m.raw_column_values) AS k(key)
        WHERE m.client_id_code = ${clientIdCode}
        GROUP BY k.key
        ORDER BY n_rows DESC, k.key
      `;

  for (const r of keyRows) {
    const truncatedSample =
      r.sample && r.sample.length > 80 ? r.sample.slice(0, 77) + "..." : r.sample ?? "";
    console.log(`${r.n_rows}\t${r.key}\t${truncatedSample}`);
  }
  console.log(`\n# Total distinct keys: ${keyRows.length}`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
