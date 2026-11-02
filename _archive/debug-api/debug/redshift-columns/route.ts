import { NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";

export async function GET() {
  try {
    const rows = await queryRedshift(`
      SELECT table_schema, table_name, column_name
      FROM information_schema.columns
      WHERE LOWER(column_name) LIKE '%forecast%'
         OR LOWER(column_name) LIKE '%goal%'
         OR LOWER(column_name) LIKE '%salesforecast%'
      ORDER BY table_schema, table_name, ordinal_position
      LIMIT 200
    `);

    return NextResponse.json({ success: true, rows });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}