/* eslint-disable react-doctor/js-set-map-lookups */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { variations, master } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

// Dimensions we extract from the variations JSONB blob
const VARIATION_DIMENSIONS = [
  "VariationThemeName",
  "Color",
  "Size",
  "Flavor",
  "Style",
] as const;

// GET /api/variations/[id]/suggest — auto-suggest groups and tags from Amazon variation data
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getAuthSession();
  if (!session)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Get the variation to find its clientId and primaryDimension
  const [variation] = await db
    .select({
      clientId: variations.clientId,
      primaryDimension: variations.primaryDimension,
      themeAttributes: variations.themeAttributes,
    })
    .from(variations)
    .where(eq(variations.id, id))
    .limit(1);

  if (!variation)
    return NextResponse.json({ error: "Variation not found" }, { status: 404 });

  // Get products that belong to this variation OR share the same clientId
  // and have variations JSONB data
  const products = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      itemName: master.itemName,
      variationsData: master.variations,
    })
    .from(master)
    .where(
      or(
        eq(master.variationRef, id),
        eq(master.clientIdCode, variation.clientId)
      )
    );

  // Extract unique values per dimension
  const dimensionValues: Record<string, Set<string>> = {};
  const themeNames = new Set<string>();

  for (const product of products) {
    const data = product.variationsData;
    if (!data) continue;

    for (const dim of VARIATION_DIMENSIONS) {
      const val = data[dim];
      if (val && val.trim()) {
        if (dim === "VariationThemeName") {
          themeNames.add(val.trim());
        } else {
          if (!dimensionValues[dim]) dimensionValues[dim] = new Set();
          dimensionValues[dim].add(val.trim());
        }
      }
    }

    // Also check for any other non-standard keys that have values
    for (const [key, val] of Object.entries(data)) {
      if (
        val &&
        val.trim() &&
        !["VariationID", "VariationProduct", "ChildRelationshipType"].includes(key) &&
        !VARIATION_DIMENSIONS.includes(key as (typeof VARIATION_DIMENSIONS)[number])
      ) {
        if (!dimensionValues[key]) dimensionValues[key] = new Set();
        dimensionValues[key].add(val.trim());
      }
    }
  }

  // Determine primary dimension for groups (e.g., "Color")
  const primaryDim = variation.primaryDimension || "Color";

  // Suggest groups from primary dimension values
  const groupValues = dimensionValues[primaryDim];
  const suggestedGroups = groupValues
    ? Array.from(groupValues).sort().map((name) => ({
        name,
        dimension: primaryDim,
      }))
    : [];

  // Suggest tags from all non-primary dimensions
  const suggestedTags: { dimension: string; values: string[] }[] = [];
  for (const [dimension, values] of Object.entries(dimensionValues)) {
    if (dimension === primaryDim) continue; // groups, not tags
    if (values.size > 0) {
      suggestedTags.push({
        dimension,
        values: Array.from(values).sort(),
      });
    }
  }

  // Also include theme info for setting the variation's theme_attributes
  const parsedThemes = Array.from(themeNames).flatMap((t) =>
    t.split("/").map((s) => s.replace(/Name$/, "").trim())
  );

  return NextResponse.json({
    suggestedGroups,
    suggestedTags,
    suggestedThemeAttributes: [...new Set(parsedThemes)],
    suggestedPrimaryDimension: parsedThemes[0] || null,
    productCount: products.length,
  });
}
