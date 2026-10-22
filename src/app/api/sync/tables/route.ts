import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { BigQuery } from "@google-cloud/bigquery";

export const maxDuration = 60;

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DATASET = process.env.BQ_DATASET || "1o8 Hub";

function getBigQueryClient(): BigQuery {
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    let privateKey = process.env.GCP_PRIVATE_KEY;
    privateKey = privateKey.replace(/\\n/g, "\n");
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = JSON.parse(privateKey);
    }
    return new BigQuery({
      projectId: PROJECT_ID,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });
  }
  return new BigQuery({ projectId: PROJECT_ID });
}

// Tables that are affected by a pending incremental sync
const SYNC_AFFECTED_TABLES = ["Master", "Master_Staging"];

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bq = getBigQueryClient();
    const ds = bq.dataset(DATASET);
    const [tables] = await ds.getTables();

    const tableInfos = await Promise.all(
      tables.map(async (table) => {
        const tableId = table.id!;
        try {
          const [metadata] = await table.getMetadata();
          const numRows = parseInt(metadata.numRows ?? "0", 10);
          const numBytes = parseInt(metadata.numBytes ?? "0", 10);
          const lastModified = metadata.lastModifiedTime
            ? new Date(parseInt(metadata.lastModifiedTime, 10)).toISOString()
            : null;
          const createdAt = metadata.creationTime
            ? new Date(parseInt(metadata.creationTime, 10)).toISOString()
            : null;
          const columnCount = metadata.schema?.fields?.length ?? 0;
          const type = metadata.type ?? "TABLE";

          return {
            id: tableId,
            type,
            numRows,
            numBytes,
            columnCount,
            lastModified,
            createdAt,
            affectedBySync: SYNC_AFFECTED_TABLES.includes(tableId),
          };
        } catch {
          return {
            id: tableId,
            type: "TABLE",
            numRows: 0,
            numBytes: 0,
            columnCount: 0,
            lastModified: null,
            createdAt: null,
            affectedBySync: SYNC_AFFECTED_TABLES.includes(tableId),
          };
        }
      })
    );

    // Sort: affected tables first, then alphabetical
    tableInfos.sort((a, b) => {
      if (a.affectedBySync !== b.affectedBySync)
        return a.affectedBySync ? -1 : 1;
      return a.id.localeCompare(b.id);
    });

    return NextResponse.json({
      dataset: `${PROJECT_ID}.${DATASET}`,
      tables: tableInfos,
    });
  } catch (err) {
    console.error("Failed to fetch BQ table metadata:", err);
    return NextResponse.json(
      { error: "Failed to fetch BigQuery tables" },
      { status: 500 }
    );
  }
}
