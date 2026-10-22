/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-flatmap-filter */
/**
 * Normalizes deeply nested SP-API catalog/listing responses into a flat structure
 * that maps to Hub field names.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NormalizedAmazonData {
  // Identity
  asin: string;
  marketplace: string;

  // Title & Brand
  itemName: string | null;
  brandName: string | null;

  // Bullets
  bulletPoint1: string | null;
  bulletPoint2: string | null;
  bulletPoint3: string | null;
  bulletPoint4: string | null;
  bulletPoint5: string | null;

  // Description
  productDescription: string | null;

  // Pricing
  listPrice: string | null;
  currency: string | null;

  // Images
  mainImageUrl: string | null;
  otherImageUrls: string[];

  // Features
  productFeatures: string[];

  // Keywords (from Listings API)
  genericKeywords: string | null;
  platinumKeywords: string | null;
  searchTerms: string | null;

  // Classification
  productType: string | null;

  // Metadata
  lastFetchedAt: string;

  // Raw responses for debugging
  _rawCatalogItem: any;
  _rawListingItem: any;
}

function safeGet(obj: any, ...paths: string[]): string | null {
  for (const path of paths) {
    const parts = path.split(".");
    let val = obj;
    for (const part of parts) {
      if (val == null) break;
      // Handle array indexing like "[0]"
      const match = part.match(/^(\w+)\[(\d+)\]$/);
      if (match) {
        val = val[match[1]];
        if (Array.isArray(val)) val = val[parseInt(match[2], 10)];
        else val = undefined;
      } else {
        val = val[part];
      }
    }
    if (val != null && val !== "") {
      return typeof val === "object" ? JSON.stringify(val) : String(val);
    }
  }
  return null;
}

function safeGetArray(obj: any, path: string): any[] {
  const parts = path.split(".");
  let val = obj;
  for (const part of parts) {
    if (val == null) return [];
    val = val[part];
  }
  return Array.isArray(val) ? val : [];
}

/**
 * Normalize a Catalog Items API response (and optionally a Listings API response)
 * into a flat NormalizedAmazonData structure.
 */
export function normalizeCatalogItem(
  catalogItem: any,
  listingItem?: any
): NormalizedAmazonData {
  const attributes = catalogItem?.attributes ?? {};
  const summaries = safeGetArray(catalogItem, "summaries");
  const summary = summaries[0] ?? {};
  const imagesContainer = safeGetArray(catalogItem, "images");
  const imageSet = imagesContainer[0]?.images ?? [];
  const productTypes = safeGetArray(catalogItem, "productTypes");

  // Title: prefer summaries, fall back to attributes
  const itemName =
    summary.itemName ??
    safeGet(attributes, "item_name[0].value") ??
    null;

  // Brand: prefer summaries, fall back to attributes
  const brandName =
    summary.brand ??
    safeGet(attributes, "brand[0].value") ??
    null;

  // Bullet points: from attributes.bullet_point array
  const bullets = safeGetArray(attributes, "bullet_point");
  const bulletPoint1 = bullets[0]?.value ?? null;
  const bulletPoint2 = bullets[1]?.value ?? null;
  const bulletPoint3 = bullets[2]?.value ?? null;
  const bulletPoint4 = bullets[3]?.value ?? null;
  const bulletPoint5 = bullets[4]?.value ?? null;

  // Description
  const productDescription =
    safeGet(attributes, "product_description[0].value") ?? null;

  // Pricing from summaries
  const listPrice = summary.listPrice?.amount != null
    ? String(summary.listPrice.amount)
    : null;
  const currency = summary.listPrice?.currencyCode ?? null;

  // Images — pick the highest-resolution MAIN variant
  const mainImages = imageSet.filter(
    (img: any) => img.variant === "MAIN" && img.link
  );
  const mainImage = mainImages.length > 1
    ? mainImages.reduce((best: any, img: any) =>
        (img.height ?? 0) * (img.width ?? 0) > (best.height ?? 0) * (best.width ?? 0) ? img : best
      )
    : mainImages[0] ?? null;
  const mainImageUrl = mainImage?.link ?? null;
  const otherImageUrls = imageSet
    .filter(
      (img: any) =>
        img.variant !== "MAIN" && img.variant !== "SWATCH" && img.link
    )
    .map((img: any) => img.link as string);

  // Features from attributes
  const productFeatureArr = safeGetArray(attributes, "product_feature");
  const productFeatures = productFeatureArr
    .map((f: any) => f?.value)
    .filter(Boolean) as string[];

  // Keywords from Listings API
  const listingAttrs = listingItem?.attributes ?? {};
  const genericKeywordArr = safeGetArray(listingAttrs, "generic_keyword");
  const genericKeywords =
    genericKeywordArr.length > 0
      ? genericKeywordArr.map((k: any) => k?.value).filter(Boolean).join(", ")
      : null;

  const platinumKeywordArr = safeGetArray(listingAttrs, "platinum_keywords");
  const platinumKeywords =
    platinumKeywordArr.length > 0
      ? platinumKeywordArr.map((k: any) => k?.value).filter(Boolean).join(", ")
      : null;

  const searchTermArr = safeGetArray(listingAttrs, "search_terms");
  const searchTerms =
    searchTermArr.length > 0
      ? searchTermArr.map((k: any) => k?.value).filter(Boolean).join(", ")
      : null;

  // Product type
  const productType = productTypes[0]?.productType ?? null;

  return {
    asin: catalogItem?.asin ?? "",
    marketplace: summary.marketplaceId ?? "",
    itemName,
    brandName,
    bulletPoint1,
    bulletPoint2,
    bulletPoint3,
    bulletPoint4,
    bulletPoint5,
    productDescription,
    listPrice,
    currency,
    mainImageUrl,
    otherImageUrls,
    productFeatures,
    genericKeywords,
    platinumKeywords,
    searchTerms,
    productType,
    lastFetchedAt: new Date().toISOString(),
    _rawCatalogItem: catalogItem,
    _rawListingItem: listingItem ?? null,
  };
}
