/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/async-await-in-loop */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { categoryDefinitions, attributes } from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

/**
 * GET /api/products/theme-values?client=XXX
 *
 * Returns valid values for theme attribute fields (Flavor, Size, Color, Style)
 * from attributes.category_meta for the given client. Merges across all
 * (marketplaceId, productType) pairs for which the client has category
 * definitions.
 */
export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const client = req.nextUrl.searchParams.get("client");
  if (!client)
    return NextResponse.json({ error: "client is required" }, { status: 400 });

  const THEME_FIELDS = ["Flavor", "Size", "Color", "Style", "VariationThemeName"];

  // 1. Find category definitions (mp, productType) for this client.
  const defs = await db
    .select({
      productType: categoryDefinitions.productType,
      marketplaceId: categoryDefinitions.marketplaceId,
    })
    .from(categoryDefinitions)
    .where(eq(categoryDefinitions.clientIdCode, client));

  // 2. For each (mp, pt) walk attributes.category_meta and pull theme rows
  //    that have a non-empty validValues array.
  const result: Record<string, string[]> = {};
  for (const def of defs) {
    const path = sql`${attributes.categoryMeta}->${def.marketplaceId}->${def.productType}`;
    const rows = await db
      .select({
        generalLabel: attributes.generalLabel,
        validValues: sql<string[] | null>`(${path}->'validValues')`,
      })
      .from(attributes)
      .where(
        and(
          sql`${attributes.categoryMeta} ? ${def.marketplaceId}`,
          sql`(${attributes.categoryMeta}->${def.marketplaceId}) ? ${def.productType}`,
          inArray(attributes.generalLabel, THEME_FIELDS),
          // NOTE: SQL AND does not short-circuit — Postgres may evaluate the
          // right operand first, so jsonb_array_length() would run on scalar
          // validValues and abort the query with 22023 "cannot get array
          // length of a scalar". Both operands here are safe for any jsonb
          // type, so operand reordering is harmless.
          sql`jsonb_typeof(${path}->'validValues') = 'array' AND (${path}->'validValues') <> '[]'::jsonb`
        )
      );

    for (const row of rows) {
      const field = row.generalLabel;
      if (!result[field]) result[field] = [];
      if (Array.isArray(row.validValues)) {
        for (const v of row.validValues) {
          if (
            v &&
            typeof v === "string" &&
            !v.toLowerCase().includes("deprecated") &&
            !result[field].includes(v)
          ) {
            result[field].push(v);
          }
        }
      }
    }
  }

  // Sort each field's values
  for (const key of Object.keys(result)) {
    result[key].sort();
  }

  return NextResponse.json(result);
}
