/**
 * GET /api/bq/asins — Fetch ASINs list with filters + pagination
 * POST /api/bq/asins — Fetch full data for selected ASINs (S1 pipeline)
 *
 * GET query params: clientIDCode (required), parentageLevel, variationThemeName,
 *   productCategory, productSubcategory, flavor, style, color, size, status,
 *   searchTerm, limit, offset
 *
 * POST body: { asins: string[], clientIDCode: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchASINs, fetchFullASINData, type ASINFilters } from "@/lib/bigquery";

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

    const filters: ASINFilters = { clientIDCode };

    if (searchParams.get("parentageLevel")) filters.parentageLevel = searchParams.get("parentageLevel")!;
    if (searchParams.get("variationThemeName")) filters.variationThemeName = searchParams.get("variationThemeName")!;
    if (searchParams.get("variationID")) filters.variationID = searchParams.get("variationID")!;
    if (searchParams.get("productCategory")) filters.productCategory = searchParams.get("productCategory")!;
    if (searchParams.get("productSubcategory")) filters.productSubcategory = searchParams.get("productSubcategory")!;
    if (searchParams.get("flavor")) filters.flavor = searchParams.get("flavor")!;
    if (searchParams.get("style")) filters.style = searchParams.get("style")!;
    if (searchParams.get("color")) filters.color = searchParams.get("color")!;
    if (searchParams.get("size")) filters.size = searchParams.get("size")!;
    if (searchParams.get("status")) filters.status = searchParams.get("status")!;
    if (searchParams.get("searchTerm")) filters.searchTerm = searchParams.get("searchTerm")!;
    if (searchParams.get("limit")) filters.limit = parseInt(searchParams.get("limit")!, 10);
    if (searchParams.get("offset")) filters.offset = parseInt(searchParams.get("offset")!, 10);

    const result = await fetchASINs(filters);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("BigQuery ASINs GET error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch ASINs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { asins, clientIDCode } = body;

    if (!clientIDCode) {
      return NextResponse.json(
        { error: "clientIDCode is required" },
        { status: 400 }
      );
    }
    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return NextResponse.json(
        { error: "asins array is required and must not be empty" },
        { status: 400 }
      );
    }

    const fullData = await fetchFullASINData(asins, clientIDCode);

    return NextResponse.json({ asins: fullData });
  } catch (error: any) {
    console.error("BigQuery ASINs POST error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch full ASIN data" },
      { status: 500 }
    );
  }
}
