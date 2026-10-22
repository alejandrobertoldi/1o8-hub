export type InheritedListingContent = {
  item_name?: string | null;
  detailed_bullets?: string[];
  product_description?: string | null;
  generic_keywords?: string[];
  concise_bullets?: string[];
  content_bullets?: string[];
  key_features?: string[];
};

/** Map SEO Manager S1 existing listing copy (CLR / Amazon) onto Hub SEO field names. */
export function inheritedContentToSeoRow(
  content: InheritedListingContent | null | undefined
): Record<string, string> | null {
  if (!content) return null;
  const itemName = (content.item_name || "").trim();
  const description = (content.product_description || "").trim();
  const bullets = content.detailed_bullets ?? [];
  const keywords = content.generic_keywords ?? [];
  const concise = content.concise_bullets ?? [];
  const contentBullets = content.content_bullets ?? [];
  const features = content.key_features ?? [];
  const hasAny =
    Boolean(itemName) ||
    Boolean(description) ||
    bullets.some((b) => Boolean(b?.trim())) ||
    keywords.some((k) => Boolean(k?.trim()));
  if (!hasAny) return null;

  const row: Record<string, string> = {
    SEOVersionNumber: "0",
    SEOCategory: "Inherited",
    SEOStatus: "Onboarding",
    ItemName: itemName,
    ProductDescription: description,
  };
  for (let i = 0; i < 5; i++) {
    row[`DetailedBulletPoint${i + 1}`] = (bullets[i] || "").trim();
    row[`GenericKeyword${i + 1}`] = (keywords[i] || "").trim();
    row[`ConciseBulletPoint${i + 1}`] = (concise[i] || "").trim();
    row[`PA_LIBulletPoint${i + 1}`] = (contentBullets[i] || "").trim();
    row[`KeyFeature${i + 1}`] = (features[i] || "").trim();
  }
  return row;
}
