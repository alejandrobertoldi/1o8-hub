import { NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { BigQuery } from "@google-cloud/bigquery";

export const maxDuration = 60;

const ALLOWED_DATASET = process.env.BQ_DATASET || "1o8 Hub";

function getBigQueryClient(): BigQuery {
  const projectId = process.env.GCP_PROJECT_ID || "mfhub-501815";
  if (process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY) {
    let privateKey = process.env.GCP_PRIVATE_KEY;
    privateKey = privateKey.replace(/\\n/g, "\n");
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = JSON.parse(privateKey);
    }
    return new BigQuery({
      projectId,
      credentials: {
        client_email: process.env.GCP_CLIENT_EMAIL,
        private_key: privateKey,
      },
    });
  }
  return new BigQuery({ projectId });
}

export async function GET() {
  const session = await getAuthSession();
  if (!session || !canAccessSection(session, "export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const bq = getBigQueryClient();
    const ds = bq.dataset(ALLOWED_DATASET);
    const [tables] = await ds.getTables();

    return NextResponse.json({
      datasets: [
        {
          dataset: ALLOWED_DATASET,
          tables: tables.map((t) => t.id!).sort(),
        },
      ],
    });
  } catch (err) {
    console.error("Failed to list BQ tables:", err);
    return NextResponse.json(
      { error: "Failed to list BigQuery tables" },
      { status: 500 }
    );
  }
}
