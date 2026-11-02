import { NextResponse } from "next/server";
import { queryBigQuery } from "@/lib/bigquery";
import { maacProjectId, maacDataset, maacTableName } from "@/lib/bq-datasets";

export async function GET() {
  try {
    const rows = await queryBigQuery(
      `
      SELECT column_name, data_type
      FROM \`${maacProjectId()}.${maacDataset()}.INFORMATION_SCHEMA.COLUMNS\`
      WHERE table_name = @tableName
      ORDER BY ordinal_position
    `,
      { tableName: maacTableName() }
    );

    return NextResponse.json({ success: true, rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}