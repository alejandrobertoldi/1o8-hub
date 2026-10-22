/**
 * GET /api/bq/clients
 * Fetch client list from AAC table with optional filters
 * Query params: clientName, brandName, marketplace, country, clientStatus, clientIDCode
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchClients, type ClientFilters } from "@/lib/bigquery";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters: ClientFilters = {};
    if (searchParams.get("clientName")) filters.clientName = searchParams.get("clientName")!;
    if (searchParams.get("brandName")) filters.brandName = searchParams.get("brandName")!;
    if (searchParams.get("marketplace")) filters.marketplace = searchParams.get("marketplace")!;
    if (searchParams.get("country")) filters.country = searchParams.get("country")!;
    if (searchParams.get("clientStatus")) filters.clientStatus = searchParams.get("clientStatus")!;
    if (searchParams.get("clientIDCode")) filters.clientIDCode = searchParams.get("clientIDCode")!;

    const clients = await fetchClients(filters);

    return NextResponse.json({ clients });
  } catch (error: any) {
    console.error("BigQuery clients error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch clients" },
      { status: 500 }
    );
  }
}
