import type { ColumnAttribute } from "./db/schema";

export const DEFAULT_MARKETPLACE_ID = "ATVPDKIKX0DER";

/** Return the requirement string for an attribute given a productType, or null if absent. */
export function getAttributeRequirement(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productType: string | null | undefined,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): string | null {
  if (!productType) return null;
  const entry = attr.categoryMeta?.[marketplaceId]?.[productType];
  return entry?.requirement ?? null;
}

/** True if the attr has a non-Optional/Not-Required level for the given productType. */
export function isAttributeRelevantForCategory(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productType: string | null | undefined,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): boolean {
  const r = getAttributeRequirement(attr, productType, marketplaceId);
  return !!r && r !== "Optional" && r !== "Not Required";
}

/** True if any of the supplied productTypes has a non-Optional level for the attr. */
export function isAttributeRelevantForAnyCategory(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productTypes: Iterable<string>,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): boolean {
  for (const pt of productTypes) {
    if (isAttributeRelevantForCategory(attr, pt, marketplaceId)) return true;
  }
  return false;
}

const STRENGTH: Record<string, number> = {
  Required: 4,
  "Conditionally Required": 3,
  Recommended: 2,
  Preferred: 2,
  Optional: 1,
  "Not Required": 0,
};

/** Highest requirement across a set of productTypes (used for multi-product summaries). */
export function strongestRequirement(
  attr: Pick<ColumnAttribute, "categoryMeta">,
  productTypes: Iterable<string>,
  marketplaceId: string = DEFAULT_MARKETPLACE_ID,
): string {
  let best = "";
  let bestScore = -1;
  for (const pt of productTypes) {
    const r = getAttributeRequirement(attr, pt, marketplaceId);
    if (!r) continue;
    const s = STRENGTH[r] ?? 0;
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  return best;
}
