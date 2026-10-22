// ── Field mapping: S6 output → master product ────────────────

/** Maps S6 column names to master product field paths */
export const FIELD_MAP: Record<string, { target: "core" | "contentSeo"; field: string }> = {
  Title:                      { target: "core",       field: "itemName" },
  ItemHighlight:              { target: "core",       field: "itemHighlight" },
  ProductDescription:         { target: "contentSeo", field: "ProductDescription" },
  DetailedBulletPoint_1:      { target: "contentSeo", field: "DetailedBulletPoint1" },
  DetailedBulletPoint_2:      { target: "contentSeo", field: "DetailedBulletPoint2" },
  DetailedBulletPoint_3:      { target: "contentSeo", field: "DetailedBulletPoint3" },
  DetailedBulletPoint_4:      { target: "contentSeo", field: "DetailedBulletPoint4" },
  DetailedBulletPoint_5:      { target: "contentSeo", field: "DetailedBulletPoint5" },
  ConciseBulletPoint_1:       { target: "contentSeo", field: "ConciseBulletPoint1" },
  ConciseBulletPoint_2:       { target: "contentSeo", field: "ConciseBulletPoint2" },
  ConciseBulletPoint_3:       { target: "contentSeo", field: "ConciseBulletPoint3" },
  ConciseBulletPoint_4:       { target: "contentSeo", field: "ConciseBulletPoint4" },
  ConciseBulletPoint_5:       { target: "contentSeo", field: "ConciseBulletPoint5" },
  ContentBulletPoint_1:       { target: "contentSeo", field: "PA_LIBulletPoint1" },
  ContentBulletPoint_2:       { target: "contentSeo", field: "PA_LIBulletPoint2" },
  ContentBulletPoint_3:       { target: "contentSeo", field: "PA_LIBulletPoint3" },
  ContentBulletPoint_4:       { target: "contentSeo", field: "PA_LIBulletPoint4" },
  ContentBulletPoint_5:       { target: "contentSeo", field: "PA_LIBulletPoint5" },
  KeyFeaturesBulletPoint_1:   { target: "contentSeo", field: "KeyFeature1" },
  KeyFeaturesBulletPoint_2:   { target: "contentSeo", field: "KeyFeature2" },
  KeyFeaturesBulletPoint_3:   { target: "contentSeo", field: "KeyFeature3" },
  KeyFeaturesBulletPoint_4:   { target: "contentSeo", field: "KeyFeature4" },
  KeyFeaturesBulletPoint_5:   { target: "contentSeo", field: "KeyFeature5" },
  BackendSearchTerms:         { target: "core",       field: "genericKeywords" },
};

/** Extract mapped fields from generatedContent */
export function extractMappedFields(gc: Record<string, unknown>): Map<string, { target: "core" | "contentSeo"; field: string; value: string }> {
  const mapped = new Map<string, { target: "core" | "contentSeo"; field: string; value: string }>();
  for (const [s6Col, mapping] of Object.entries(FIELD_MAP)) {
    const value = gc[s6Col];
    if (value && typeof value === "string" && value.trim()) {
      mapped.set(s6Col, { ...mapping, value: value.trim() });
    }
  }
  return mapped;
}
