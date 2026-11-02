/* eslint-disable react-doctor/async-await-in-loop */
import { NextResponse } from "next/server";
import { queryRedshift } from "@/lib/redshift";

export async function GET() {
  const tables = [
    "campaign_summary",
    "keyword_summary",
    "advertised_product_summary",
  ];

  const results: Record<string, unknown> = {};

  for (const table of tables) {
    const rows = await queryRedshift(
      `SELECT * FROM intentwise_ecommerce_graph.${table} WHERE account_id = '154290' LIMIT 1`,
      []
    );
    results[table] = Object.keys(rows[0] || {});
  }

  return NextResponse.json({ results });
}