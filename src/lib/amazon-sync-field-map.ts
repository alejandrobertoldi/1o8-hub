/**
 * Amazon Sync field map — single source of truth for what gets compared.
 * Used by both the sync API (to compute discrepancies) and the UI (to display them).
 */

import type { RainforestProduct } from "@/types/rainforest";
import { getProductFieldValue } from "@/lib/product-mapper";
import type { Product } from "@/lib/db/schema";

export type CompareMode = "exact" | "normalized" | "numeric" | "boolean" | "count";

export interface SyncField {
  field_name: string;
  label: string;
  field_group: string;
  bqName?: string; // BQ column name for write-back (only fields with catalog mapping)
  getRainforestValue: (p: RainforestProduct) => string | null;
  getCatalogValue: (row: Product) => string | null;
  compareMode: CompareMode;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v || null;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return null;
}

export const SYNC_FIELDS: SyncField[] = [
  // ── Content ─────────────────────────────────────────────────────
  {
    field_name: "title",
    label: "Title",
    field_group: "Content",
    bqName: "ItemName",
    getRainforestValue: (p) => p.title ?? null,
    getCatalogValue: (r) => getProductFieldValue(r, "ItemName"),
    compareMode: "exact",
  },
  {
    field_name: "title_excluding_variant_name",
    label: "Title (excl. variant)",
    field_group: "Content",
    getRainforestValue: (p) => p.title_excluding_variant_name ?? null,
    getCatalogValue: () => null,
    compareMode: "exact",
  },
  {
    field_name: "brand",
    label: "Brand",
    field_group: "Content",
    bqName: "BrandName",
    getRainforestValue: (p) => p.brand ?? null,
    getCatalogValue: (r) => getProductFieldValue(r, "BrandName"),
    compareMode: "normalized",
  },
  ...Array.from({ length: 5 }, (_, i) => ({
    field_name: `bullet_${i + 1}`,
    label: `Bullet Point ${i + 1}`,
    field_group: "Content",
    bqName: `DetailedBulletPoint${i + 1}`,
    getRainforestValue: (p: RainforestProduct) => p.feature_bullets?.[i] ?? null,
    getCatalogValue: (r: Product) => getProductFieldValue(r, `DetailedBulletPoint${i + 1}`),
    compareMode: "exact" as CompareMode,
  })),
  {
    field_name: "categories_flat",
    label: "Categories",
    field_group: "Content",
    getRainforestValue: (p) => p.categories_flat ?? null,
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "keywords",
    label: "Keywords",
    field_group: "Content",
    bqName: "GenericKeyword1",
    getRainforestValue: () => null,
    getCatalogValue: (r) => getProductFieldValue(r, "GenericKeyword1"),
    compareMode: "normalized",
  },

  // ── Images & Media ──────────────────────────────────────────────
  {
    field_name: "main_image_url",
    label: "Main Image",
    field_group: "Images & Media",
    bqName: "MainImageURL",
    getRainforestValue: (p) => p.main_image?.link ?? null,
    getCatalogValue: (r) => getProductFieldValue(r, "MainImageURL"),
    compareMode: "exact",
  },
  {
    field_name: "image_count",
    label: "Image Count",
    field_group: "Images & Media",
    getRainforestValue: (p) => str(p.images_count),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "video_count",
    label: "Video Count",
    field_group: "Images & Media",
    getRainforestValue: (p) => str(p.videos_count),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "has_a_plus",
    label: "A+ Content",
    field_group: "Images & Media",
    getRainforestValue: (p) => str(p.a_plus_content?.has_a_plus_content),
    getCatalogValue: () => null,
    compareMode: "boolean",
  },
  {
    field_name: "has_brand_story",
    label: "Brand Story",
    field_group: "Images & Media",
    getRainforestValue: (p) => str(p.a_plus_content?.has_brand_story),
    getCatalogValue: () => null,
    compareMode: "boolean",
  },
  {
    field_name: "a_plus_image_count",
    label: "A+ Image Count",
    field_group: "Images & Media",
    getRainforestValue: (p) => str(p.a_plus_content?.all_images?.length ?? 0),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "a_plus_alt_text_rate",
    label: "A+ Alt Text %",
    field_group: "Images & Media",
    getRainforestValue: (p) => {
      const imgs = p.a_plus_content?.all_images;
      if (!imgs || imgs.length === 0) return null;
      const withAlt = imgs.filter((i) => i.name?.trim()).length;
      return `${Math.round((withAlt / imgs.length) * 100)}%`;
    },
    getCatalogValue: () => null,
    compareMode: "exact",
  },

  // ── Pricing & Availability ──────────────────────────────────────
  {
    field_name: "price",
    label: "Price",
    field_group: "Pricing & Availability",
    bqName: "ListPrice",
    getRainforestValue: (p) => str(p.buybox_winner?.price?.value),
    getCatalogValue: (r) => {
      const v = getProductFieldValue(r, "ListPrice");
      return v ? v.replace(/[$,]/g, "") : null;
    },
    compareMode: "numeric",
  },
  {
    field_name: "availability",
    label: "Availability",
    field_group: "Pricing & Availability",
    getRainforestValue: (p) => {
      const a = p.buybox_winner?.availability;
      if (!a) return null;
      return typeof a === "object" ? a.raw ?? null : null;
    },
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "is_prime",
    label: "Is Prime",
    field_group: "Pricing & Availability",
    getRainforestValue: (p) => str(p.buybox_winner?.is_prime),
    getCatalogValue: () => null,
    compareMode: "boolean",
  },
  {
    field_name: "fulfillment_type",
    label: "Fulfillment",
    field_group: "Pricing & Availability",
    getRainforestValue: (p) => {
      const f = p.buybox_winner?.fulfillment;
      if (!f) return null;
      return f.is_fulfilled_by_amazon ? "FBA" : "MF";
    },
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "has_subscribe_and_save",
    label: "Subscribe & Save",
    field_group: "Pricing & Availability",
    getRainforestValue: (p) => str(p.buybox_winner?.subscribe_and_save != null),
    getCatalogValue: () => null,
    compareMode: "boolean",
  },
  {
    field_name: "unit_price",
    label: "Unit Price",
    field_group: "Pricing & Availability",
    getRainforestValue: (p) => p.buybox_winner?.unit_price?.raw ?? null,
    getCatalogValue: () => null,
    compareMode: "exact",
  },

  // ── Performance ─────────────────────────────────────────────────
  {
    field_name: "rating",
    label: "Rating",
    field_group: "Performance",
    getRainforestValue: (p) => str(p.rating),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "ratings_total",
    label: "Review Count",
    field_group: "Performance",
    getRainforestValue: (p) => str(p.ratings_total),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "bsr_1_rank",
    label: "BSR #1 Rank",
    field_group: "Performance",
    getRainforestValue: (p) => str(p.bestsellers_rank?.[0]?.rank),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "bsr_1_category",
    label: "BSR #1 Category",
    field_group: "Performance",
    getRainforestValue: (p) => p.bestsellers_rank?.[0]?.category ?? null,
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "bsr_2_rank",
    label: "BSR #2 Rank",
    field_group: "Performance",
    getRainforestValue: (p) => str(p.bestsellers_rank?.[1]?.rank),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "bsr_2_category",
    label: "BSR #2 Category",
    field_group: "Performance",
    getRainforestValue: (p) => p.bestsellers_rank?.[1]?.category ?? null,
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "recent_sales",
    label: "Recent Sales",
    field_group: "Performance",
    getRainforestValue: (p) => p.recent_sales ?? null,
    getCatalogValue: () => null,
    compareMode: "exact",
  },
  {
    field_name: "amazons_choice",
    label: "Amazon's Choice",
    field_group: "Performance",
    getRainforestValue: (p) => str(p.amazons_choice != null),
    getCatalogValue: () => null,
    compareMode: "boolean",
  },

  // ── Logistics ───────────────────────────────────────────────────
  {
    field_name: "dimensions",
    label: "Dimensions",
    field_group: "Logistics",
    getRainforestValue: (p) => (typeof p.dimensions === "string" ? p.dimensions : null),
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "weight",
    label: "Weight",
    field_group: "Logistics",
    getRainforestValue: (p) => (typeof p.weight === "string" ? p.weight : null),
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "date_first_available",
    label: "Date First Available",
    field_group: "Logistics",
    getRainforestValue: (p) => p.first_available?.raw ?? null,
    getCatalogValue: () => null,
    compareMode: "exact",
  },
  {
    field_name: "parent_asin",
    label: "Parent ASIN",
    field_group: "Logistics",
    bqName: "ParentASIN",
    getRainforestValue: (p) => p.parent_asin ?? null,
    getCatalogValue: (r) => getProductFieldValue(r, "ParentASIN"),
    compareMode: "exact",
  },
  {
    field_name: "manufacturer",
    label: "Manufacturer",
    field_group: "Logistics",
    bqName: "Manufacturer",
    getRainforestValue: (p) => p.manufacturer ?? null,
    getCatalogValue: (r) => getProductFieldValue(r, "Manufacturer"),
    compareMode: "normalized",
  },
  {
    field_name: "ingredients_flat",
    label: "Ingredients",
    field_group: "Logistics",
    getRainforestValue: (p) => p.ingredients?.join(", ") ?? null,
    getCatalogValue: () => null,
    compareMode: "normalized",
  },
  {
    field_name: "variant_count",
    label: "Variant Count",
    field_group: "Logistics",
    getRainforestValue: (p) => str(p.variants?.length ?? 0),
    getCatalogValue: () => null,
    compareMode: "numeric",
  },
  {
    field_name: "variant_asins",
    label: "Variant ASINs",
    field_group: "Logistics",
    getRainforestValue: (p) => p.variants?.map((v) => v.asin).join(", ") ?? null,
    getCatalogValue: () => null,
    compareMode: "exact",
  },
];

export const SYNC_FIELD_GROUPS = [
  "Content",
  "Images & Media",
  "Pricing & Availability",
  "Performance",
  "Logistics",
] as const;

/**
 * Compare two values using the specified mode.
 * Returns the discrepancy status.
 */
export function compareFieldValues(
  catalogValue: string | null,
  amazonValue: string | null,
  mode: CompareMode
): "match" | "mismatch" | "missing_in_catalog" | "missing_in_amazon" {
  const catNorm = normalize(catalogValue);
  const amzNorm = normalize(amazonValue);

  if (!catNorm && !amzNorm) return "match"; // both empty = match
  if (!catNorm && amzNorm) return "missing_in_catalog";
  if (catNorm && !amzNorm) return "missing_in_amazon";

  switch (mode) {
    case "exact":
      return catNorm === amzNorm ? "match" : "mismatch";
    case "normalized":
      return catNorm!.toLowerCase().trim() === amzNorm!.toLowerCase().trim()
        ? "match"
        : "mismatch";
    case "numeric": {
      const catNum = parseFloat(catNorm!);
      const amzNum = parseFloat(amzNorm!);
      if (isNaN(catNum) || isNaN(amzNum)) return catNorm === amzNorm ? "match" : "mismatch";
      return catNum === amzNum ? "match" : "mismatch";
    }
    case "boolean":
      return catNorm!.toLowerCase() === amzNorm!.toLowerCase() ? "match" : "mismatch";
    case "count":
      return catNorm === amzNorm ? "match" : "mismatch";
    default:
      return catNorm === amzNorm ? "match" : "mismatch";
  }
}

function normalize(val: string | null | undefined): string | null {
  if (val == null) return null;
  const s = val
    .replace(/<[^>]*>/g, "")
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length === 0 ? null : s;
}

/**
 * Compute all discrepancies for a product + Rainforest snapshot.
 */
export function computeDiscrepancies(
  product: Product,
  rainforestProduct: RainforestProduct
): Array<{
  field_name: string;
  field_group: string;
  catalog_value: string | null;
  amazon_value: string | null;
  status: "match" | "mismatch" | "missing_in_catalog" | "missing_in_amazon";
}> {
  return SYNC_FIELDS.map((field) => {
    const catalogValue = field.getCatalogValue(product);
    const amazonValue = field.getRainforestValue(rainforestProduct);
    const status = compareFieldValues(catalogValue, amazonValue, field.compareMode);
    return {
      field_name: field.field_name,
      field_group: field.field_group,
      catalog_value: catalogValue,
      amazon_value: amazonValue,
      status,
    };
  });
}
