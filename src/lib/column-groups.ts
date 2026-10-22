/**
 * Column group definitions — controls how the ~972 columns are organized
 * in the product detail view and mapped to JSONB blobs in the DB.
 *
 * @deprecated The product detail view now uses column_attributes (referenceGroup/subgroup)
 * via useColumnAttributes() for grouping. This file is still used by product-mapper.ts
 * for routing values to the correct JSONB blob during import/export.
 */

export type ColumnGroup = {
  id: string;
  label: string;
  /** Which JSONB blob stores these columns in the DB (null = core column) */
  dbField: string | null;
  /** Default UI state in detail view */
  defaultExpanded: boolean;
  /** Sort priority (lower = shown first) */
  order: number;
};

export const COLUMN_GROUPS: ColumnGroup[] = [
  {
    id: "product_identity",
    label: "Product Identity",
    dbField: null,
    defaultExpanded: true,
    order: 0,
  },
  {
    id: "classification",
    label: "Classification",
    dbField: null,
    defaultExpanded: true,
    order: 1,
  },
  {
    id: "brand_title",
    label: "Brand & Title",
    dbField: null,
    defaultExpanded: true,
    order: 2,
  },
  {
    id: "content_seo",
    label: "Content & SEO",
    dbField: "contentSeo",
    defaultExpanded: true,
    order: 3,
  },
  {
    id: "images",
    label: "Images",
    dbField: "images",
    defaultExpanded: true,
    order: 4,
  },
  {
    id: "pricing",
    label: "Pricing",
    dbField: null,
    defaultExpanded: true,
    order: 5,
  },
  {
    id: "variations",
    label: "Variations",
    dbField: "variations",
    defaultExpanded: false,
    order: 6,
  },
  {
    id: "packaging",
    label: "Packaging",
    dbField: "packaging",
    defaultExpanded: false,
    order: 7,
  },
  {
    id: "target_audience",
    label: "Target Audience",
    dbField: "targetAudience",
    defaultExpanded: false,
    order: 8,
  },
  {
    id: "fulfillment",
    label: "Fulfillment",
    dbField: "fulfillment",
    defaultExpanded: false,
    order: 9,
  },
  {
    id: "product_attributes",
    label: "Product Attributes",
    dbField: "productAttributes",
    defaultExpanded: false,
    order: 10,
  },
  {
    id: "nutrition_supplements",
    label: "Nutrition & Supplements",
    dbField: "nutritionSupplements",
    defaultExpanded: false,
    order: 11,
  },
  {
    id: "compliance_safety",
    label: "Compliance & Safety",
    dbField: "complianceSafety",
    defaultExpanded: false,
    order: 12,
  },
  {
    id: "dimensions_weight",
    label: "Dimensions & Weight",
    dbField: "dimensionsWeight",
    defaultExpanded: false,
    order: 13,
  },
  {
    id: "other",
    label: "Other Attributes",
    dbField: "otherAttributes",
    defaultExpanded: false,
    order: 14,
  },
];

export const COLUMN_GROUP_MAP = Object.fromEntries(
  COLUMN_GROUPS.map((g) => [g.id, g])
);
