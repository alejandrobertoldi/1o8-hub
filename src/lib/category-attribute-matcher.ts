/**
 * Match Amazon category attributes to Hub column attributes.
 *
 * Strategies applied in order (first match wins):
 * 1. Exact label match (case-insensitive)
 * 2. Normalized match (strip spaces/hyphens/underscores)
 * 3. Static known mappings (hardcoded correspondences)
 * 4. Base name extraction (strip marketplace/language/index suffixes)
 */

import type { ParsedCategoryAttribute } from "./category-report-parser";
import type { Attribute, ColumnAttribute } from "./db/schema";

/** Hardcoded mappings: Amazon base field name → Hub generalLabel */
const KNOWN_MAPPINGS: Record<string, string> = {
  item_name: "ItemName",
  brand: "BrandName",
  brand_name: "BrandName",
  bullet_point: "BulletPoint1",
  "bullet_point#1": "BulletPoint1",
  "bullet_point#2": "BulletPoint2",
  "bullet_point#3": "BulletPoint3",
  "bullet_point#4": "BulletPoint4",
  "bullet_point#5": "BulletPoint5",
  generic_keyword: "GenericKeywords",
  generic_keywords: "GenericKeywords",
  product_description: "ProductDescription",
  main_product_image_locator: "MainImageUrl",
  main_image_url: "MainImageUrl",
  item_type_keyword: "ItemTypeKeyword",
  feed_product_type: "FeedProductType",
  product_type: "ProductType",
  recommended_browse_nodes: "RecommendedBrowseNodes",
  platinum_keywords: "PlatinumKeywords",
  contribution_sku: "SKU",
  list_price: "ListPrice",
  parentage_level: "ParentageLevel",
  child_parent_sku_relationship: "ParentSKU",
  external_product_id: "ASIN",
  item_weight: "ItemWeight",
  item_length: "ItemLength",
  item_width: "ItemWidth",
  item_height: "ItemHeight",
  package_weight: "PackageWeight",
  package_length: "PackageLength",
  package_width: "PackageWidth",
  package_height: "PackageHeight",
  manufacturer: "Manufacturer",
  country_of_origin: "CountryOfOrigin",
  model_number: "ModelNumber",
  part_number: "PartNumber",
  color: "Color",
  color_name: "Color",
  size: "Size",
  size_name: "Size",
  material: "Material",
  external_product_id_type: "ProductIdType",
  product_id_type: "ProductIdType",
  variation_theme: "VariationThemeName",
  variation_theme_name: "VariationThemeName",
  child_relationship_type: "ChildRelationshipType",
  parent_child: "ChildRelationshipType",
  flavor: "Flavor",
  flavor_name: "Flavor",
  style: "Style",
  style_name: "Style",
  parent_sku: "ParentSKU",
  parent_asin: "ParentASIN",
};

/**
 * Match parsed Amazon category attributes to Hub column attributes.
 * Returns a Map of amazonFieldName → generalLabel.
 */
export function matchHubFields(
  attributes: ParsedCategoryAttribute[],
  columnAttributes: ColumnAttribute[]
): Map<string, string> {
  const matches = new Map<string, string>();

  // Build lookup structures for Hub columns
  const byLabelLower = new Map<string, string>();
  const byNormalized = new Map<string, string>();

  for (const col of columnAttributes) {
    byLabelLower.set(col.generalLabel.toLowerCase(), col.generalLabel);
    byNormalized.set(normalize(col.generalLabel), col.generalLabel);
  }

  for (const attr of attributes) {
    // Strategy 1: Exact label match (case-insensitive)
    const exactMatch = byLabelLower.get(attr.localLabel.toLowerCase());
    if (exactMatch) {
      matches.set(attr.amazonFieldName, exactMatch);
      continue;
    }

    // Strategy 2: Normalized match
    const normalizedLabel = normalize(attr.localLabel);
    const normalizedMatch = byNormalized.get(normalizedLabel);
    if (normalizedMatch) {
      matches.set(attr.amazonFieldName, normalizedMatch);
      continue;
    }

    // Strategy 3: Static known mappings using base name
    const baseName = extractBaseName(attr.amazonFieldName);
    const knownMatch = KNOWN_MAPPINGS[baseName];
    if (knownMatch && byLabelLower.has(knownMatch.toLowerCase())) {
      matches.set(attr.amazonFieldName, knownMatch);
      continue;
    }

    // Also try with index suffix for bullet points etc.
    const baseWithIndex = extractBaseNameWithIndex(attr.amazonFieldName);
    const knownMatchIdx = KNOWN_MAPPINGS[baseWithIndex];
    if (knownMatchIdx && byLabelLower.has(knownMatchIdx.toLowerCase())) {
      matches.set(attr.amazonFieldName, knownMatchIdx);
      continue;
    }

    // Strategy 4: Base name → normalized match against Hub labels
    const normalizedBase = normalize(baseName);
    const baseMatch = byNormalized.get(normalizedBase);
    if (baseMatch) {
      matches.set(attr.amazonFieldName, baseMatch);
      continue;
    }
  }

  return matches;
}

/** Remove spaces, hyphens, underscores → lowercase */
function normalize(str: string): string {
  return str.replace(/[\s\-_]/g, "").toLowerCase();
}

/**
 * Extract base field name from Amazon field name:
 * "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value" → "item_name"
 * "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#3.value" → "bullet_point"
 * "::listing_status" → "listing_status"
 */
function extractBaseName(fieldName: string): string {
  // Remove leading "::"
  let name = fieldName.replace(/^::/, "");
  // Remove bracketed parameters
  name = name.replace(/\[.*?\]/g, "");
  // Remove #N.value / #N.name / etc.
  name = name.replace(/#\d+\..*$/, "");
  return name.trim();
}

/**
 * Extract base name preserving the index number:
 * "bullet_point[...]#3.value" → "bullet_point#3"
 */
function extractBaseNameWithIndex(fieldName: string): string {
  let name = fieldName.replace(/^::/, "");
  name = name.replace(/\[.*?\]/g, "");
  // Keep #N but remove .value/.name etc.
  name = name.replace(/(#\d+)\..*$/, "$1");
  return name.trim();
}

/**
 * Wrapper around `matchHubFields` that also exposes the matched attribute's
 * primary key. Callers (e.g. CLR upload) need the `id` to write directly
 * into `attributes.category_meta` for that row.
 *
 * Returns Map<amazonFieldName, { id, generalLabel }>.
 */
export function matchHubFieldsWithIds(
  parsedAttrs: ParsedCategoryAttribute[],
  rows: Pick<Attribute, "id" | "generalLabel">[]
): Map<string, { id: number; generalLabel: string }> {
  const byGeneralLabel = new Map(rows.map((r) => [r.generalLabel, r]));
  const matches = matchHubFields(parsedAttrs, rows as ColumnAttribute[]);
  const out = new Map<string, { id: number; generalLabel: string }>();
  for (const [amzn, gl] of matches) {
    const row = byGeneralLabel.get(gl);
    if (row) out.set(amzn, { id: row.id, generalLabel: gl });
  }
  return out;
}
