import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { BigQuery } from "@google-cloud/bigquery";
import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { autoMapColumns } from "@/lib/import-mapper";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
const DEFAULT_DATASET = process.env.BQ_DATASET || "1o8 Hub";
const DEFAULT_TABLE = process.env.BQ_TABLE || "Master";

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

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !canAccessSection(session, "import")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const dataset = params.get("dataset") || DEFAULT_DATASET;
  const table = params.get("table") || DEFAULT_TABLE;
  const limit = Math.min(20, Math.max(1, parseInt(params.get("limit") || "5", 10)));

  const bigquery = getBigQueryClient();
  const fullTable = `${PROJECT_ID}.${dataset}.${table}`;

  try {
    const [[previewRows], [countResult]] = await Promise.all([
      bigquery.query({
        query: `SELECT * FROM \`${fullTable}\` LIMIT ${limit}`,
      }),
      bigquery.query({
        query: `SELECT COUNT(*) as total FROM \`${fullTable}\``,
      }),
    ]);

    const totalRows = Number(countResult[0].total);

    if (previewRows.length === 0) {
      return NextResponse.json({
        totalRows: 0,
        headers: [],
        preview: [],
        mappings: [],
        dataset,
        table,
      });
    }

    const headers = Object.keys(previewRows[0]);
    const preview = previewRows.slice(0, limit).map((row: Record<string, unknown>) => {
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        flat[k] = v != null ? String(v) : "";
      }
      return flat;
    });

    // Auto-map columns
    const attrs = await db.select().from(attributes);
    const mappings = autoMapColumns(headers, attrs);

    return NextResponse.json({
      totalRows,
      headers,
      preview,
      mappings,
      dataset,
      table,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "BigQuery query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
