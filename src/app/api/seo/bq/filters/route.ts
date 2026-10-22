import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getAuthSession } from "@/lib/auth-db";
import { unauthorized, serverError } from "@/lib/api-utils";

export const maxDuration = 60;

/**
 * GET /api/seo/bq/filters
 * Fetch distinct filter options for ASINs belonging to a client.
 * Reads from Hub's PostgreSQL products table.
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) return unauthorized();

  try {
    const clientIDCode = new URL(request.url).searchParams.get("clientIDCode");
    if (!clientIDCode) {
      return NextResponse.json({ error: "clientIDCode is required" }, { status: 400 });
    }

    const [row] = await db
      .select({
        parentageLevels: sql<string[]>`ARRAY_AGG(DISTINCT ${master.parentageLevel}) FILTER (WHERE ${master.parentageLevel} IS NOT NULL)`,
        variationThemeNames: sql<string[]>`ARRAY_AGG(DISTINCT ${master.variations}->>'VariationThemeName') FILTER (WHERE ${master.variations}->>'VariationThemeName' IS NOT NULL)`,
        variationIDs: sql<string[]>`ARRAY_AGG(DISTINCT ${master.variations}->>'VariationID') FILTER (WHERE ${master.variations}->>'VariationID' IS NOT NULL)`,
        productCategories: sql<string[]>`ARRAY_AGG(DISTINCT ${master.productAttributes}->>'ProductCategory') FILTER (WHERE ${master.productAttributes}->>'ProductCategory' IS NOT NULL)`,
        productSubcategories: sql<string[]>`ARRAY_AGG(DISTINCT ${master.productAttributes}->>'ProductSubcategory') FILTER (WHERE ${master.productAttributes}->>'ProductSubcategory' IS NOT NULL)`,
        flavors: sql<string[]>`ARRAY_AGG(DISTINCT ${master.variations}->>'Flavor') FILTER (WHERE ${master.variations}->>'Flavor' IS NOT NULL)`,
        styles: sql<string[]>`ARRAY_AGG(DISTINCT ${master.variations}->>'Style') FILTER (WHERE ${master.variations}->>'Style' IS NOT NULL)`,
        colors: sql<string[]>`ARRAY_AGG(DISTINCT ${master.variations}->>'Color') FILTER (WHERE ${master.variations}->>'Color' IS NOT NULL)`,
        sizes: sql<string[]>`ARRAY_AGG(DISTINCT ${master.variations}->>'Size') FILTER (WHERE ${master.variations}->>'Size' IS NOT NULL)`,
        statuses: sql<string[]>`ARRAY_AGG(DISTINCT ${master.status}) FILTER (WHERE ${master.status} IS NOT NULL)`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(master)
      .where(eq(master.clientIdCode, clientIDCode));

    return NextResponse.json({
      parentageLevels: (row?.parentageLevels || []).filter(Boolean).sort(),
      variationThemeNames: (row?.variationThemeNames || []).filter(Boolean).sort(),
      variationIDs: (row?.variationIDs || []).filter(Boolean).sort(),
      productCategories: (row?.productCategories || []).filter(Boolean).sort(),
      productSubcategories: (row?.productSubcategories || []).filter(Boolean).sort(),
      flavors: (row?.flavors || []).filter(Boolean).sort(),
      styles: (row?.styles || []).filter(Boolean).sort(),
      colors: (row?.colors || []).filter(Boolean).sort(),
      sizes: (row?.sizes || []).filter(Boolean).sort(),
      statuses: (row?.statuses || []).filter(Boolean).sort(),
      totalCount: row?.totalCount || 0,
    });
  } catch (error: unknown) {
    console.error("Filters error:", error);
    return serverError(error, "Failed to fetch filter options");
  }
}
