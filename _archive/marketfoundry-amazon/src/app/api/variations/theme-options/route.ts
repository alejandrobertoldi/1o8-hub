/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryDefinitions, attributes, master } from "@/lib/db/schema";
import { eq, and, ilike, sql, isNotNull } from "drizzle-orm";

/**
 * GET /api/variations/theme-options?clientId=XXX
 *
 * Returns valid variation theme values for the given client. Primary source:
 * attributes.category_meta (from uploaded Category Listing Reports), matched
 * via generalLabel ILIKE '%variation%theme%'. Fallback: distinct
 * VariationThemeName values already present on the client's master products
 * — covers product types (HAT/SHIRT/APPAREL/etc.) whose CLRs do not ship
 * variation-theme valid values in the attributes table.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId)
    return NextResponse.json(
      { error: "clientId is required" },
      { status: 400 }
    );

  // 1. Find category definitions (mp, productType) for this client.
  const defs = await db
    .select({
      productType: categoryDefinitions.productType,
      marketplaceId: categoryDefinitions.marketplaceId,
    })
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.clientIdCode, clientId));

  // 2. For each (mp, pt) walk attributes.category_meta to find variation-theme
  //    attributes with a non-null validValues array.
  const valueSet = new Set<string>();
  const matchedProductTypes = new Set<string>();
  for (const def of defs) {
    const path = sql`${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}`;
    const rows = await db
      .select({
        validValues: sql<string[] | null>`(${path}->'validValues')`,
      })
      .from(attributes)
      .where(
        and(
          sql`${attributes.categoryMeta} ? ${def.marketplaceId}`,
          sql`(${attributes.categoryMeta}->${def.marketplaceId}) ? ${def.productType}`,
          ilike(attributes.generalLabel, "%variation%theme%"),
          sql`(${path}->'validValues') IS NOT NULL`
        )
      );

    if (rows.length > 0) matchedProductTypes.add(def.productType);

    for (const row of rows) {
      if (Array.isArray(row.validValues)) {
        for (const v of row.validValues) {
          if (v && typeof v === "string" && !v.toLowerCase().includes("deprecated")) {
            valueSet.add(v);
          }
        }
      }
    }
  }

  // 3. Fallback: pull distinct VariationThemeName values from the client's
  //    master products. Covers categories whose attributes.category_meta
  //    lacks variation-theme valid values (apparel, hats, etc.).
  const productThemeRows = await db
    .select({
      theme: sql<string | null>`${master.variations}->>'VariationThemeName'`,
    })
    .from(master)
    .where(
      and(
        eq(master.clientIdCode, clientId),
        isNotNull(sql`${master.variations}->>'VariationThemeName'`)
      )
    )
    .groupBy(sql`${master.variations}->>'VariationThemeName'`);

  for (const row of productThemeRows) {
    if (row.theme && typeof row.theme === "string") {
      valueSet.add(row.theme);
    }
  }

  return NextResponse.json({
    themes: Array.from(valueSet).sort(),
    productTypes: Array.from(matchedProductTypes),
  });
}
