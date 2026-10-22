import { NextResponse } from "next/server";
import { Pool } from "pg";

const pool = new Pool({
  host: process.env.REDSHIFT_HOST,
  port: Number(process.env.REDSHIFT_PORT),
  database: process.env.REDSHIFT_DATABASE,
  user: process.env.REDSHIFT_USER,
  password: process.env.REDSHIFT_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT report_date, account_id, product_sales
      FROM intentwise_ecommerce_graph.account_summary
      WHERE account_id = 272970
      AND report_date >= '2025-01-01'
      ORDER BY report_date DESC
      LIMIT 5
    `);
    return NextResponse.json({ success: true, rows: result.rows });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}