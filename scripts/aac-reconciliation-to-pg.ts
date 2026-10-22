/* eslint-disable react-doctor/async-parallel */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import postgres from "postgres";
import { readFileSync } from "fs";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require" });

async function main() {
  // Read CSV (skip header)
  const csv = readFileSync(resolve(__dirname, "../docs/aac-reconciliation.csv"), "utf8");
  const lines = csv.split("\n").slice(1).filter(Boolean);

  // Naive CSV parse (each cell is "..." with no embedded commas in our data — verified)
  const rows = lines.map((l) => {
    const m = l.match(/^"([^"]*)","([^"]*)","([^"]*)","([^"]*)","([^"]*)"$/);
    if (!m) throw new Error("Bad row: " + l);
    return { group_name: m[1], canonical_name: m[2], bigquery: m[3], supabase_rawdata: m[4], status: m[5] };
  });
  console.log("Parsed " + rows.length + " rows");

  await sql.begin(async (txRaw) => {
    const tx = txRaw as unknown as typeof sql;
    await tx`DROP TABLE IF EXISTS aac_reconciliation`;
    await tx`
      CREATE TABLE aac_reconciliation (
        id SERIAL PRIMARY KEY,
        group_name TEXT NOT NULL,
        canonical_name TEXT NOT NULL,
        bigquery TEXT NOT NULL,
        supabase_rawdata TEXT NOT NULL,
        status TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await tx`CREATE INDEX aac_reconciliation_status_idx ON aac_reconciliation (status)`;
    await tx`CREATE INDEX aac_reconciliation_group_idx ON aac_reconciliation (group_name)`;
    if (rows.length) await tx`INSERT INTO aac_reconciliation ${tx(rows, "group_name", "canonical_name", "bigquery", "supabase_rawdata", "status")}`;
  });

  const cnt = await sql<{ status: string; n: number }[]>`
    SELECT status, COUNT(*)::int AS n FROM aac_reconciliation GROUP BY status ORDER BY status
  `;
  console.log("Inserted by status:");
  for (const r of cnt) console.log("  " + r.status + ": " + r.n);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
