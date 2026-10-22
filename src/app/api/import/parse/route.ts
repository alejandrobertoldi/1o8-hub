import { NextRequest, NextResponse } from "next/server";
import { getAuthSession, canAccessSection } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { attributes } from "@/lib/db/schema";
import { parse } from "csv-parse/sync";
import { autoMapColumns } from "@/lib/import-mapper";
import { randomUUID } from "crypto";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session || !canAccessSection(session, "import")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (!file.name.endsWith(".csv")) {
    return NextResponse.json(
      { error: "Only .csv files are accepted" },
      { status: 400 }
    );
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File too large. Maximum size is 10MB." },
      { status: 400 }
    );
  }

  const text = await file.text();

  let records: Record<string, string>[];
  try {
    records = parse(text, {
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

  if (records.length === 0) {
    return NextResponse.json(
      { error: "CSV file is empty or has no data rows" },
      { status: 400 }
    );
  }

  const headers = Object.keys(records[0]);
  const preview = records.slice(0, 5);

  // Fetch column attributes for auto-mapping
  const attrs = await db.select().from(attributes);
  const mappings = autoMapColumns(headers, attrs);

  const importId = randomUUID();

  return NextResponse.json({
    importId,
    fileName: file.name,
    totalRows: records.length,
    headers,
    preview,
    mappings,
  });
}
