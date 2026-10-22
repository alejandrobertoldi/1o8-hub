/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Read-only diagnostic: PG AAC_master vs the three BQ AAC tables.
 * No writes.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import pgClient from "postgres";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const sql = pgClient(process.env.DATABASE_URL!, { ssl: "require" });

function bq(): BigQuery {
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

async function pgInfo() {
  console.log("=== PG: aac (Drizzle-managed) ===");
  const aacCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='aac'
    ORDER BY ordinal_position`;
  console.log(`cols: ${aacCols.length}`);
  const aacCount = await sql`SELECT count(*)::int AS c FROM aac`;
  console.log(`rows: ${aacCount[0].c}`);

  console.log('\n=== PG: "AAC_master" (manual) ===');
  const masterCols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='AAC_master'
    ORDER BY ordinal_position`;
  console.log(`cols: ${masterCols.length}`);
  if (masterCols.length > 0) {
    const masterCount = await sql`SELECT count(*)::int AS c FROM "AAC_master"`;
    console.log(`rows: ${masterCount[0].c}`);
    console.log("first 10 cols:", masterCols.slice(0, 10).map((c) => c.column_name));
    console.log("last 10 cols:", masterCols.slice(-10).map((c) => c.column_name));
  } else {
    console.log("(table not found in public schema)");
  }

  return { aacCols, masterCols };
}

async function bqInfo() {
  const client = bq();
  const targets = [
    { dataset: "1o8Hub", table: "AAC" },
    { dataset: "1o8BibleApp", table: "AAC" },
    { dataset: "1o8MAAC", table: "1o8MAAC_AAC" },
  ];
  const results: { fqtn: string; cols: { name: string; type: string }[]; rows: number | null }[] = [];
  for (const t of targets) {
    const fqtn = `${PROJECT_ID}.${t.dataset}.${t.table}`;
    try {
      const [meta] = await client.dataset(t.dataset).table(t.table).getMetadata();
      const cols = (meta.schema?.fields ?? []).map((f: { name: string; type: string }) => ({
        name: f.name,
        type: f.type,
      }));
      let rows: number | null = null;
      try {
        const [r] = await client.query({
          query: `SELECT count(*) AS c FROM \`${fqtn}\``,
          location: "us-west1",
        });
        rows = Number(r[0]?.c ?? 0);
      } catch {
        // ignore — some datasets in other locations
      }
      console.log(`\n=== BQ: ${fqtn} ===`);
      console.log(`cols: ${cols.length}, rows: ${rows ?? "?"}`);
      console.log("cols:", cols.map((c: { name: string; type: string }) => `${c.name}:${c.type}`).join(", "));
      results.push({ fqtn, cols, rows });
    } catch (e) {
      console.log(`\n=== BQ: ${fqtn} ===`);
      console.log(`error: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    }
  }
  return results;
}

(async () => {
  try {
    const pg = await pgInfo();
    const bqs = await bqInfo();

    // Column overlap matrix
    const masterColNames = new Set(pg.masterCols.map((c) => c.column_name));
    console.log("\n=== Overlap (AAC_master columns ∩ each BQ AAC) ===");
    for (const r of bqs) {
      const overlap = r.cols.filter((c) => masterColNames.has(c.name));
      const masterOnly = [...masterColNames].filter((m) => !r.cols.some((c) => c.name === m));
      const bqOnly = r.cols.filter((c) => !masterColNames.has(c.name));
      console.log(`\n${r.fqtn}:`);
      console.log(`  overlap: ${overlap.length}/${r.cols.length} BQ cols match AAC_master`);
      console.log(`  AAC_master cols NOT in BQ (first 20): ${masterOnly.slice(0, 20).join(", ")}`);
      console.log(`  BQ cols NOT in AAC_master (first 20): ${bqOnly.slice(0, 20).map((c) => c.name).join(", ")}`);
    }
  } catch (e) {
    console.error("ERR:", e);
  } finally {
    await sql.end();
    process.exit(0);
  }
})();
