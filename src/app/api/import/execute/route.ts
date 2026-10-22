import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { BigQuery } from "@google-cloud/bigquery";
import { and, eq } from "drizzle-orm";
import { parse } from "csv-parse/sync";
import { mapBqRowToProduct, type BqRow } from "@/lib/product-mapper";

export const maxDuration = 60;

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";

interface MappingEntry {
  sourceHeader: string;
  bqName: string;
}

interface ImportConfig {
  source: "csv" | "bigquery";
  mappings: MappingEntry[];
  conflictMode: "skip" | "overwrite" | "merge";
  clientFilter?: string;
  bqDataset?: string;
  bqTable?: string;
}

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

function applyMappings(
  sourceRows: Record<string, string>[],
  mappings: MappingEntry[]
): BqRow[] {
  return sourceRows.map((row) => {
    const bqRow: BqRow = {};
    for (const m of mappings) {
      if (m.bqName && row[m.sourceHeader] !== undefined) {
        bqRow[m.bqName] = row[m.sourceHeader];
      }
    }
    return bqRow;
  });
}

const BATCH_SIZE = 50;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !canAccessSection(session, "import")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const startTime = Date.now();

  let config: ImportConfig;
  let sourceRows: Record<string, string>[];

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    // CSV source
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const configStr = formData.get("config") as string | null;

    if (!file || !configStr) {
      return NextResponse.json(
        { error: "Missing file or config" },
        { status: 400 }
      );
    }

    try {
      config = JSON.parse(configStr);
    } catch {
      return NextResponse.json(
        { error: "Invalid config JSON" },
        { status: 400 }
      );
    }

    const text = await file.text();
    try {
      sourceRows = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "CSV parse error";
      return NextResponse.json(
        { error: `Failed to parse CSV: ${msg}` },
        { status: 400 }
      );
    }
  } else {
    // BigQuery source
    const body = await req.json();
    config = body as ImportConfig;

    if (!config.bqDataset || !config.bqTable) {
      return NextResponse.json(
        { error: "bqDataset and bqTable are required for BigQuery import" },
        { status: 400 }
      );
    }

    const bigquery = getBigQueryClient();
    const fullTable = `${PROJECT_ID}.${config.bqDataset}.${config.bqTable}`;

    try {
      const [rows] = await bigquery.query({
        query: `SELECT * FROM \`${fullTable}\``,
      });
      sourceRows = rows.map((row: Record<string, unknown>) => {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          flat[k] = v != null ? String(v) : "";
        }
        return flat;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "BigQuery query failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (!config.mappings || config.mappings.length === 0) {
    return NextResponse.json(
      { error: "No column mappings provided" },
      { status: 400 }
    );
  }

  if (!config.conflictMode) {
    config.conflictMode = "skip";
  }

  // Apply column mappings to get BQ-shaped rows
  const bqRows = applyMappings(sourceRows, config.mappings);

  // Apply client filter if set
  let filteredRows = bqRows;
  if (config.clientFilter) {
    filteredRows = bqRows.filter(
      (row) => row.ClientIDCode === config.clientFilter
    );
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < filteredRows.length; i += BATCH_SIZE) {
    const batch = filteredRows.slice(i, i + BATCH_SIZE);

    for (const bqRow of batch) {
      try {
        const asin = bqRow.ASIN || null;
        const sku = bqRow.SKU || null;
        const marketplace = bqRow.Marketplace || null;

        // Check for existing product
        let existingProduct = null;
        if (asin && sku && marketplace) {
          const found = await db
            .select()
            .from(master)
            .where(
              and(
                eq(master.asin, asin),
                eq(master.sku, sku),
                eq(master.marketplace, marketplace)
              )
            )
            .limit(1);
          if (found.length > 0) {
            existingProduct = found[0];
          }
        } else if (asin && sku) {
          const found = await db
            .select()
            .from(master)
            .where(and(eq(master.asin, asin), eq(master.sku, sku)))
            .limit(1);
          if (found.length > 0) {
            existingProduct = found[0];
          }
        }

        if (existingProduct) {
          if (config.conflictMode === "skip") {
            skipped++;
            continue;
          }

          if (config.conflictMode === "overwrite") {
            const newProduct = mapBqRowToProduct(bqRow);
            await db
              .update(master)
              .set({
                ...newProduct,
                updatedAt: new Date(),
                isDirty: true,
              })
              .where(eq(master.id, existingProduct.id));
            updated++;
          } else if (config.conflictMode === "merge") {
            // Only fill in fields that are empty in the DB
            const existingRaw = existingProduct.rawColumnValues ?? {};
            const mergedBqRow: BqRow = { ...existingRaw };

            for (const [key, value] of Object.entries(bqRow)) {
              if (value && (!existingRaw[key] || existingRaw[key].trim() === "")) {
                mergedBqRow[key] = value;
              }
            }

            const mergedProduct = mapBqRowToProduct(mergedBqRow);
            await db
              .update(master)
              .set({
                ...mergedProduct,
                updatedAt: new Date(),
                isDirty: true,
              })
              .where(eq(master.id, existingProduct.id));
            updated++;
          }
        } else {
          const newProduct = mapBqRowToProduct(bqRow);
          await db.insert(master).values(newProduct);
          inserted++;
        }
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (errors.length < 10) {
          errors.push(msg);
        }
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1) + "s";

  return NextResponse.json({
    success: true,
    inserted,
    updated,
    skipped,
    failed,
    errors,
    duration,
  });
}
