/**
 * Maps Rainforest API fields to 1o8 Hub catalog column names
 * for side-by-side comparison rendering.
 */

export interface RainforestFieldMapping {
  label: string;
  rainforestPath: string;
  catalogKey: string;
  group: string;
  isImage?: boolean;
  isCount?: boolean;
}

export const FIELD_GROUPS = [
  "Content",
  "Images & Media",
  "Pricing & Availability",
  "Performance",
  "Listing Quality",
  "Logistics",
] as const;

export type FieldGroup = (typeof FIELD_GROUPS)[number];

export const RAINFOREST_FIELD_MAP: RainforestFieldMapping[] = [
  // Content
  { label: "Title", rainforestPath: "title", catalogKey: "ItemName", group: "Content" },
  { label: "Brand", rainforestPath: "brand", catalogKey: "BrandName", group: "Content" },
  { label: "Bullet Point 1", rainforestPath: "feature_bullets.0", catalogKey: "DetailedBulletPoint1", group: "Content" },
  { label: "Bullet Point 2", rainforestPath: "feature_bullets.1", catalogKey: "DetailedBulletPoint2", group: "Content" },
  { label: "Bullet Point 3", rainforestPath: "feature_bullets.2", catalogKey: "DetailedBulletPoint3", group: "Content" },
  { label: "Bullet Point 4", rainforestPath: "feature_bullets.3", catalogKey: "DetailedBulletPoint4", group: "Content" },
  { label: "Bullet Point 5", rainforestPath: "feature_bullets.4", catalogKey: "DetailedBulletPoint5", group: "Content" },

  // Images & Media
  { label: "Main Image", rainforestPath: "main_image.link", catalogKey: "MainImageURL", group: "Images & Media", isImage: true },
  { label: "Image Count", rainforestPath: "images_count", catalogKey: "", group: "Images & Media", isCount: true },
  { label: "Video Count", rainforestPath: "videos_count", catalogKey: "", group: "Images & Media", isCount: true },

  // Pricing & Availability
  { label: "Price", rainforestPath: "buybox_winner.price.raw", catalogKey: "ListPrice", group: "Pricing & Availability" },
  { label: "Availability", rainforestPath: "buybox_winner.availability.raw", catalogKey: "", group: "Pricing & Availability" },
  { label: "Fulfillment", rainforestPath: "buybox_winner.fulfillment.is_fulfilled_by_amazon", catalogKey: "", group: "Pricing & Availability" },
  { label: "Is Prime", rainforestPath: "buybox_winner.is_prime", catalogKey: "", group: "Pricing & Availability" },

  // Performance
  { label: "Rating", rainforestPath: "rating", catalogKey: "", group: "Performance" },
  { label: "Review Count", rainforestPath: "ratings_total", catalogKey: "", group: "Performance" },
  { label: "BSR #1", rainforestPath: "bestsellers_rank.0", catalogKey: "", group: "Performance" },
  { label: "BSR #2", rainforestPath: "bestsellers_rank.1", catalogKey: "", group: "Performance" },
  { label: "Recent Sales", rainforestPath: "recent_sales", catalogKey: "", group: "Performance" },
  { label: "Amazon's Choice", rainforestPath: "amazons_choice.badge_text", catalogKey: "", group: "Performance" },

  // Listing Quality
  { label: "A+ Content", rainforestPath: "a_plus_content.has_a_plus_content", catalogKey: "", group: "Listing Quality" },
  { label: "Brand Story", rainforestPath: "a_plus_content.has_brand_story", catalogKey: "", group: "Listing Quality" },
  { label: "Variants", rainforestPath: "variants", catalogKey: "", group: "Listing Quality" },
  { label: "Categories", rainforestPath: "categories_flat", catalogKey: "", group: "Listing Quality" },

  // Logistics
  { label: "Dimensions", rainforestPath: "dimensions", catalogKey: "", group: "Logistics" },
  { label: "Weight", rainforestPath: "weight", catalogKey: "", group: "Logistics" },
  { label: "Date First Available", rainforestPath: "first_available.raw", catalogKey: "", group: "Logistics" },
  { label: "Parent ASIN", rainforestPath: "parent_asin", catalogKey: "ParentASIN", group: "Logistics" },
];

/**
 * Resolve a dot-notation path on an object.
 * e.g. getByPath(obj, "buybox_winner.price.raw") -> obj.buybox_winner.price.raw
 */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
