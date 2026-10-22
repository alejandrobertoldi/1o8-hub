/* eslint-disable react-doctor/async-parallel */
/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Import the Attributes table from BigQuery into PostgreSQL.
 * This gives the app a data-driven column registry with:
 * - ReferenceGroup / Subgroup for UI sections
 * - Per-client requirement levels
 * - Essential flag, data types, help text
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
import postgres from "postgres";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";

function getBigQueryClient(): BigQuery {
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

const CLIENT_CODES = [
  "C23_SC_US", "DRE_SC_US", "DRC_SC_US", "CHE_SC_US", "CHE_VC_US",
  "GOO_SC_US", "PRO_SC_US", "PUR_SC_US", "FRE_SC_US", "GAF_SC_US",
  "HOT_SC_US", "WHI_SC_US", "TRT_SC_US", "TRS_SC_US", "DRW_SC_US",
  "BNU_SC_US", "BRA_SC_US", "POO_SC_US", "SPL_SC_ES", "GLO_SC_US",
  "ROY_SC_US", "PKN_SC_US",
];

async function main() {
  const bq = getBigQueryClient();
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

  // 1. Fetch all attributes from BQ
  console.log("Fetching attributes from BigQuery...");
  const [rows] = await bq.query({
    query: "SELECT * FROM `mfhub-501815.MFBibleApp.Attributes` ORDER BY CAST(MasterAttributeRow AS INT64)",
    location: "us-west1",
  });
  console.log(`Fetched ${rows.length} attribute rows`);

  // 2. Create the column_attributes table
  console.log("Creating column_attributes table...");
  await sql`
    DROP TABLE IF EXISTS column_attributes CASCADE
  `;
  await sql`
    CREATE TABLE column_attributes (
      id SERIAL PRIMARY KEY,
      master_row INTEGER NOT NULL,
      general_label VARCHAR(255) NOT NULL UNIQUE,
      specific_label TEXT,
      bigquery_label TEXT,
      bq_data_type VARCHAR(20) DEFAULT 'STRING',
      label_details TEXT,
      label_max_options VARCHAR(10),
      reference_group VARCHAR(100) NOT NULL,
      subgroup VARCHAR(100) DEFAULT '',
      is_essential BOOLEAN NOT NULL DEFAULT false,
      client_requirements JSONB NOT NULL DEFAULT '{}'
    )
  `;

  await sql`CREATE INDEX idx_col_attr_general_label ON column_attributes(general_label)`;
  await sql`CREATE INDEX idx_col_attr_reference_group ON column_attributes(reference_group)`;
  await sql`CREATE INDEX idx_col_attr_subgroup ON column_attributes(subgroup)`;
  await sql`CREATE INDEX idx_col_attr_essential ON column_attributes(is_essential)`;

  // 3. Insert rows
  console.log("Inserting rows...");
  let inserted = 0;

  for (const row of rows) {
    // Build per-client requirements JSONB
    const clientReqs: Record<string, string> = {};
    for (const client of CLIENT_CODES) {
      const val = (row as Record<string, string>)[client];
      if (val && val.trim()) {
        clientReqs[client] = val.trim();
      }
    }

    await sql`
      INSERT INTO column_attributes (
        master_row, general_label, specific_label, bigquery_label,
        bq_data_type, label_details, label_max_options,
        reference_group, subgroup, is_essential, client_requirements
      ) VALUES (
        ${parseInt(row.MasterAttributeRow)},
        ${row.GeneralLabel},
        ${row.SpecificLabel || null},
        ${row.BigqueryLabel || null},
        ${row.BQDataType || "STRING"},
        ${row.LabelDetails || null},
        ${row.LabelMaxOptions || null},
        ${row.ReferenceGroup},
        ${row.Subgroup || ""},
        ${row.Essential === "true"},
        ${JSON.stringify(clientReqs)}
      )
    `;
    inserted++;
    if (inserted % 100 === 0) console.log(`  ${inserted}/${rows.length}`);
  }

  console.log(`\nImported ${inserted} column attributes`);

  // 4. Verify
  const [{ cnt }] = await sql`SELECT COUNT(*) as cnt FROM column_attributes`;
  console.log(`Verification: ${cnt} rows in column_attributes`);

  const essentialCount = await sql`SELECT COUNT(*) as cnt FROM column_attributes WHERE is_essential = true`;
  console.log(`Essential columns: ${essentialCount[0].cnt}`);

  const groups = await sql`SELECT reference_group, COUNT(*) as cnt FROM column_attributes GROUP BY reference_group ORDER BY cnt DESC`;
  console.log("\nBy reference group:");
  for (const g of groups) {
    console.log(`  ${g.reference_group}: ${g.cnt}`);
  }

  await sql.end();
  console.log("\nDone!");
}

main().catch(console.error);
