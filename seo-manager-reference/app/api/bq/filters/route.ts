/**
 * GET /api/bq/filters?clientIDCode=XXX
 * Fetch available filter options (distinct values) for a client's ASINs
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchASINFilterOptions } from "@/lib/bigquery";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientIDCode = searchParams.get("clientIDCode");

    if (!clientIDCode) {
      return NextResponse.json(
        { error: "clientIDCode is required" },
        { status: 400 }
      );
    }

    const options = await fetchASINFilterOptions(clientIDCode);

    return NextResponse.json(options);
  } catch (error: any) {
    console.error("BigQuery filters error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch filter options" },
      { status: 500 }
    );
  }
}
