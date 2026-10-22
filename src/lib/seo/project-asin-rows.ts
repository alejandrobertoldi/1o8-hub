// Shared by project creation (POST /api/seo/projects) and the S0 "Target ASINs"
// edit (PUT /api/seo/projects/[id]/targets): load the chosen products and turn
// them into seo_asins rows with the Hub listing copy as the baseline.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { getProductFieldValue } from "@/lib/product-mapper";
import { applyParentVariationFill } from "@/lib/seo/parent-variation-fill";

/** Products by id, restricted to one client (ids from another client are dropped). */
export async function selectTargetProducts(clientIdCode: string, productIds: string[]) {
  return db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      parentageLevel: master.parentageLevel,
      parentAsin: master.parentAsin,
      parentSku: master.parentSku,
      itemName: master.itemName,
      summarizedTitle: master.summarizedTitle,
      mainImageUrl: master.mainImageUrl,
      variations: master.variations,
      variationGroup: master.variationGroup,
      contentSeo: master.contentSeo,
      rawColumnValues: master.rawColumnValues,
      genericKeywords: master.genericKeywords,
      brandName: master.brandName,
      clientIdCode: master.clientIdCode,
    })
    .from(master)
    .where(and(inArray(master.id, productIds), eq(master.clientIdCode, clientIdCode)));
}

export type TargetProduct = Awaited<ReturnType<typeof selectTargetProducts>>[number];

/**
 * seo_asins rows for a project. Content is read via getProductFieldValue so
 * SP-API-synced products (content_seo NULL, data in raw_column_values under the
 * SP-API key shape) resolve correctly — see SP_API_ALIASES in product-mapper.ts.
 */
export function buildSeoAsinRows(projectId: string, products: TargetProduct[]) {
  return products.map((p) => {
    const v = p.variations || {};
    const get = (k: string) => getProductFieldValue(p as Parameters<typeof getProductFieldValue>[0], k) || "";
    return applyParentVariationFill({
      projectId,
      asin: p.asin || "",
      sku: p.sku || "",
      parentageLevel: p.parentageLevel || "",
      variationId: v.VariationID || "",
      variationProduct: v.VariationProduct || "",
      variationThemeName: v.VariationThemeName || "",
      flavor: v.Flavor || "",
      style: v.Style || "",
      color: v.Color || "",
      size: v.Size || "",
      variationGroup: p.variationGroup || "",
      existingContent: {
        item_name: p.itemName || p.summarizedTitle || "",
        detailed_bullets: [
          get("DetailedBulletPoint1"),
          get("DetailedBulletPoint2"),
          get("DetailedBulletPoint3"),
          get("DetailedBulletPoint4"),
          get("DetailedBulletPoint5"),
        ],
        product_description: get("ProductDescription"),
        generic_keywords: [
          p.genericKeywords || "",
        ].filter(Boolean),
        concise_bullets: [
          get("ConciseBulletPoint1"),
          get("ConciseBulletPoint2"),
          get("ConciseBulletPoint3"),
          get("ConciseBulletPoint4"),
          get("ConciseBulletPoint5"),
        ],
        content_bullets: [
          get("PA_LIBulletPoint1"),
          get("PA_LIBulletPoint2"),
          get("PA_LIBulletPoint3"),
          get("PA_LIBulletPoint4"),
          get("PA_LIBulletPoint5"),
        ],
        key_features: [
          get("KeyFeature1"),
          get("KeyFeature2"),
          get("KeyFeature3"),
          get("KeyFeature4"),
          get("KeyFeature5"),
        ],
      },
    });
  });
}
