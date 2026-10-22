/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Import AAC client data from BigQuery into PostgreSQL.
 *
 * Usage: npx tsx scripts/import-aac.ts
 *
 * Source: mfhub-501815.MFBibleApp.AAC
 * Maps ClientIDCode → client_id_code, ClientStatus → client_status
 * Upserts on client_id_code (always overwrites with fresh BQ data).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import pgClient from "postgres";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = "1o8BibleApp";
const TABLE = "AAC";

// BigQuery still uses the old _1o8M column suffix; Postgres raw_data uses _MF.
// Remap on the way in so app code (src/lib/constants.ts TEAM_ROLES etc.) can use
// the new suffix without renaming the BigQuery source column.
const BQ_COLUMN_RENAMES: Record<string, string> = {
  ExecutiveStrategist_1o8M: "ExecutiveStrategist_MF",
  AccountManager_1o8M: "AccountManager_MF",
  ProjectManager_1o8M: "ProjectManager_MF",
  ProjectManagerAsana_1o8M: "ProjectManagerAsana_MF",
  DesignManager_1o8M: "DesignManager_MF",
  SEOManager_1o8M: "SEOManager_MF",
  PPCManager_1o8M: "PPCManager_MF",
  CatalogManager_1o8M: "CatalogManager_MF",
  DesignUploadManager_1o8M: "DesignUploadManager_MF",
};

const sql = pgClient(process.env.DATABASE_URL!, { ssl: "require" });

async function main() {
  let bigquery: BigQuery;

  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    bigquery = new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
    });
  } else {
    bigquery = new BigQuery({ projectId: PROJECT_ID });
  }

  console.log(`Querying ${PROJECT_ID}.${DATASET}.${TABLE}...`);

  const [rows] = await bigquery.query({
    query: `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\``,
    location: "us-west1",
  });

  console.log(`Fetched ${rows.length} rows from BigQuery`);

  if (rows.length > 0) {
    console.log("Columns:", Object.keys(rows[0]).join(", "));
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const clientIdCode = (row.ClientIDCode || "").trim();
    const clientStatus = (row.ClientStatus || "").trim();
    const clientName = (row.ClientName || "").trim();

    if (!clientIdCode) {
      skipped++;
      continue;
    }

    // Build raw data (all columns as strings)
    const rawData: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      rawData[BQ_COLUMN_RENAMES[key] ?? key] = val != null ? String(val) : "";
    }

    // Upsert via ON CONFLICT
    const existing = await sql`
      SELECT id FROM aac_clients WHERE client_id_code = ${clientIdCode} LIMIT 1
    `;

    const powerbiUrl = (row.PowerBIDashboardURL || "").trim() || null;

    if (existing.length > 0) {
      await sql`
        UPDATE aac_clients SET
          client_status = ${clientStatus},
          client_name = ${clientName || null},
          powerbi_embed_url = COALESCE(${powerbiUrl}, powerbi_embed_url),
          raw_data = ${JSON.stringify(rawData)}::jsonb,
          updated_at = NOW()
        WHERE id = ${existing[0].id}
      `;
      updated++;
    } else {
      await sql`
        INSERT INTO aac_clients (client_id_code, client_status, client_name, powerbi_embed_url, raw_data)
        VALUES (${clientIdCode}, ${clientStatus}, ${clientName || null}, ${powerbiUrl}, ${JSON.stringify(rawData)}::jsonb)
      `;
      inserted++;
    }
  }

  console.log(`\nImport complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped (no ClientIDCode)`);

  // Show summary
  const all = await sql`SELECT client_id_code, client_status FROM aac_clients ORDER BY client_id_code`;
  const active = all.filter((c) => c.client_status.toLowerCase() === "active");
  console.log(`Total clients in DB: ${all.length} (${active.length} active)`);
  console.log("Active clients:", active.map((c) => c.client_id_code).join(", "));

  await sql.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("Import error:", err);
  await sql.end();
  process.exit(1);
});
