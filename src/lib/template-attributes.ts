/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// template-attributes.ts
// Shared attribute-picking logic for the attribute-template flow.
// Extracted from the create-Sheet route handler so it can be reused
// by /finalize without crossing route boundaries.
// ═══════════════════════════════════════════════════════════════

import type { AttributeCategoryRow } from "@/lib/category-meta-queries";

/** Result of {@link pickAttributesForLevels}. */
export interface PickedAttributes {
  attrs: AttributeCategoryRow[];
  useIdentityHeaders: boolean;
}

/**
 * Pick the attributes to include in a category sheet for a given level set.
 *
 * - If `levels` contains "Essential", returns the canonical Min+Necessary
 *   ordering (identity cols → Required → CondRequired → Essential), then
 *   appends any OTHER selected levels (e.g. "Key") whose attributes are not
 *   already part of the Min+Necessary set — sorted alphabetically by
 *   generalLabel. `useIdentityHeaders` is true.
 * - Otherwise filters by `levels` directly (requirement match or `isKey` for
 *   "Key"). `useIdentityHeaders` is false.
 *
 * Exported so the level-merge logic can be unit-tested in isolation. The
 * dynamic-import-from-same-module pattern is intentional: it lets vi.spyOn
 * on the module namespace intercept `getMinimumNecessaryAttributes` and
 * `getAttributesForCategory` calls from this helper at test time.
 */
export async function pickAttributesForLevels(
  marketplaceId: string,
  productType: string,
  levels: string[],
): Promise<PickedAttributes> {
  const mod = await import("@/lib/category-meta-queries");
  const useIdentityHeaders = levels.includes("Essential");
  if (useIdentityHeaders) {
    const minNecessary = await mod.getMinimumNecessaryAttributes(marketplaceId, productType);
    // Any level the operator selected besides Essential needs to merge in.
    // Required + Conditionally Required are already covered by Min+Necessary;
    // the remaining requirement-based levels (Recommended, Optional) plus
    // the flag-based "Key" level have to be added explicitly here.
    const otherLevels = levels.filter((l) => l !== "Essential");
    if (otherLevels.length === 0) {
      return { attrs: minNecessary, useIdentityHeaders };
    }
    const includedIds = new Set(minNecessary.map((a) => a.id));
    const allAttrs = await mod.getAttributesForCategory(marketplaceId, productType);
    const extras = allAttrs
      .filter((a) => !includedIds.has(a.id))
      .filter((a) => {
        if (otherLevels.includes("Key") && a.isKey) return true;
        if (a.requirement && otherLevels.includes(a.requirement)) return true;
        return false;
      })
      .sort((a, b) => a.generalLabel.localeCompare(b.generalLabel));
    return { attrs: [...minNecessary, ...extras], useIdentityHeaders };
  }

  const attrs = await mod.getAttributesForCategory(marketplaceId, productType);
  // generalLabel is non-null on the attributes table — every row has one,
  // so the old `if (!a.bibleFieldMatch) return false` guard is gone. The
  // hideFromTemplate filter is also gone — that column no longer exists.
  const filtered = attrs.filter((a) => {
    if (a.requirement && levels.includes(a.requirement)) return true;
    if (levels.includes("Key") && a.isKey) return true;
    return false;
  });
  return { attrs: filtered, useIdentityHeaders };
}
