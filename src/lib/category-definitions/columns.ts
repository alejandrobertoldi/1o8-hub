import { categoryDefinitions } from "@/lib/db/schema";

/**
 * Every `category_definitions` column EXCEPT `baseline_snapshot`.
 *
 * `baseline_snapshot` is a write-only audit column: it is populated by
 * `upsertCategoryDefinitions` and never read back anywhere in the app. It is
 * also enormous — averaging 491 kB per row and 36 MB across the whole 80-row
 * table, against 9 kB for every other column combined.
 *
 * A bare `db.select().from(categoryDefinitions)` therefore shipped ~36 MB to
 * serve ~9 kB of metadata. Measured in production it averaged 15.7 s per call
 * and peaked at 116.9 s — i.e. right up against the 120 s `statement_timeout` —
 * making it the single largest consumer of database time in the project.
 *
 * Read paths must select through this projection. If you ever need the snapshot,
 * fetch it deliberately for one row by id rather than widening this object.
 */
export const categoryDefinitionColumns = {
  id: categoryDefinitions.id,
  clientIdCode: categoryDefinitions.clientIdCode,
  productType: categoryDefinitions.productType,
  marketplaceId: categoryDefinitions.marketplaceId,
  totalAttributes: categoryDefinitions.totalAttributes,
  requiredCount: categoryDefinitions.requiredCount,
  conditionalCount: categoryDefinitions.conditionalCount,
  optionalCount: categoryDefinitions.optionalCount,
  uploadedBy: categoryDefinitions.uploadedBy,
  uploadedAt: categoryDefinitions.uploadedAt,
};

/** A `category_definitions` row as returned by {@link categoryDefinitionColumns}. */
export type CategoryDefinitionRow = {
  [K in keyof typeof categoryDefinitionColumns]: (typeof categoryDefinitions.$inferSelect)[K];
};
