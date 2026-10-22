import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { BigQuery } from "@google-cloud/bigquery";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

// POST /api/export/bq/query
// Body: { dataset, table, clients?, format: "preview"|"xlsx"|"pdf", limit? }
export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !canAccessSection(session, "export")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { dataset, table, clients, statuses, selectedColumns, format = "preview", limit } = body as {
      dataset: string;
      table: string;
      clients?: string[];
      statuses?: string[];
      selectedColumns?: string[];
      format?: "preview" | "xlsx" | "pdf";
      limit?: number;
    };

    if (!dataset || !table) {
      return NextResponse.json(
        { error: "dataset and table are required" },
        { status: 400 }
      );
    }

    // Only allow the configured dataset
    if (dataset !== ALLOWED_DATASET) {
      return NextResponse.json(
        { error: `Access restricted to dataset ${ALLOWED_DATASET}` },
        { status: 403 }
      );
    }

    // Validate table name (alphanumeric + underscore only)
    const namePattern = /^[a-zA-Z0-9_]+$/;
    if (!namePattern.test(table)) {
      return NextResponse.json(
        { error: "Invalid table name" },
        { status: 400 }
      );
    }

    const bq = getBigQueryClient();
    const projectId = process.env.GCP_PROJECT_ID || "mfhub-501815";
    const fullTable = `\`${projectId}.${dataset}.${table}\``;

    // First get schema to find client-like columns
    const [metadata] = await bq
      .dataset(dataset)
      .table(table)
      .getMetadata();
    const schema = metadata.schema?.fields || [];
    const columnNames: string[] = schema.map(
      (f: { name: string }) => f.name
    );

    // Detect filterable columns
    const clientColumnCandidates = [
      "clientIDCode", "ClientIDCode", "client_id_code", "clientIdCode", "account_id",
    ];
    const statusColumnCandidates = [
      "ClientStatus", "clientStatus", "client_status", "Status", "status",
    ];
    const clientCol = columnNames.find((c) => clientColumnCandidates.includes(c));
    const statusCol = columnNames.find((c) => statusColumnCandidates.includes(c));

    // Determine which columns to query
    // Validate selectedColumns against actual schema to prevent injection
    const queryCols =
      selectedColumns && selectedColumns.length > 0
        ? selectedColumns.filter((c) => columnNames.includes(c))
        : columnNames;

    // Build query
    const selectExpr =
      queryCols.length === columnNames.length
        ? "*"
        : queryCols.map((c) => `\`${c}\``).join(", ");
    let query = `SELECT ${selectExpr} FROM ${fullTable}`;
    const params: Record<string, string | string[]> = {};
    const conditions: string[] = [];

    if (clients && clients.length > 0 && clientCol) {
      conditions.push(`${clientCol} IN UNNEST(@clients)`);
      params.clients = clients;
    }
    if (statuses && statuses.length > 0 && statusCol) {
      conditions.push(`${statusCol} IN UNNEST(@statuses)`);
      params.statuses = statuses;
    }
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }

    if (format === "preview") {
      query += ` LIMIT ${Math.min(limit || 50, 200)}`;
    } else if (limit) {
      query += ` LIMIT ${Math.min(limit, 50000)}`;
    }

    const [rows] = await bq.query({
      query,
      params,
      location: "us-west1",
    });

    if (format === "preview") {
      // Also get total row count
      let totalQuery = `SELECT COUNT(*) as total FROM ${fullTable}`;
      if (conditions.length > 0) {
        totalQuery += ` WHERE ${conditions.join(" AND ")}`;
      }
      const [countResult] = await bq.query({
        query: totalQuery,
        params,
        location: "us-west1",
      });
      const totalRows = Number(countResult[0]?.total ?? rows.length);

      return NextResponse.json({
        columns: queryCols,
        allColumns: columnNames,
        rows: rows.map((r: Record<string, unknown>) =>
          queryCols.map((c) => stringify(r[c]))
        ),
        totalRows,
        clientColumn: clientCol || null,
        statusColumn: statusCol || null,
      });
    }

    // Full data for download
    const dataRows = rows.map((r: Record<string, unknown>) =>
      queryCols.map((c) => stringify(r[c]))
    );

    if (format === "xlsx") {
      const ws = XLSX.utils.aoa_to_sheet([queryCols, ...dataRows]);

      // Auto-width columns
      ws["!cols"] = queryCols.map((col, i) => {
        let maxWidth = col.length;
        for (const row of dataRows.slice(0, 100)) {
          maxWidth = Math.max(maxWidth, (row[i] || "").length);
        }
        return { wch: Math.min(maxWidth + 2, 50) };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, table.substring(0, 31));
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${dataset}_${table}.xlsx"`,
        },
      });
    }

    if (format === "pdf") {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt" });

      doc.setFontSize(14);
      doc.text(`${dataset}.${table}`, 40, 30);
      doc.setFontSize(8);
      doc.text(
        `${rows.length} rows | Generated ${new Date().toLocaleDateString("en-US")}`,
        40,
        45
      );

      // Limit columns for PDF readability — show first 15 max
      const maxPdfCols = 15;
      const pdfColumns = queryCols.slice(0, maxPdfCols);
      const pdfRows = dataRows.map((r) => r.slice(0, maxPdfCols));

      autoTable(doc, {
        head: [pdfColumns],
        body: pdfRows,
        startY: 55,
        styles: { fontSize: 6, cellPadding: 3 },
        headStyles: { fillColor: [86, 84, 84], fontSize: 6 },
        columnStyles: Object.fromEntries(
          pdfColumns.map((_, i) => [i, { cellWidth: "auto" }])
        ),
        margin: { left: 20, right: 20 },
      });

      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${dataset}_${table}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: "Invalid format" }, { status: 400 });
  } catch (err) {
    console.error("BQ query error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to query BigQuery",
      },
      { status: 500 }
    );
  }
}

function stringify(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}
