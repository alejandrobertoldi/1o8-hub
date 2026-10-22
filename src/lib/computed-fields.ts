/**
 * Computed Fields — Fields auto-calculated from other product fields.
 *
 * UUID = ASIN_SKU_ClientIDCode
 * SummarizedTitle = VariationProduct|Style|Flavor|Color|Size (non-empty parts joined with |)
 * AmazonPDPURL = https://www.amazon.com/dp/{ASIN}
 */

/** Set of BQ column names that are computed and should be read-only */
export const COMPUTED_FIELDS = new Set(["UUID", "SummarizedTitle", "AmazonPDPURL"]);

/** BQ column names that, when changed, trigger recomputation */
const UUID_DEPS = new Set(["ASIN", "SKU", "ClientIDCode"]);
const ASIN_DEPS = new Set(["ASIN"]);
const SUMMARIZED_TITLE_DEPS = new Set([
  "VariationProduct",
  "Style",
  "Flavor",
  "Color",
  "Size",
]);

/** Map of core field prop names to their BQ equivalents (for UUID deps) */
const CORE_TO_BQ: Record<string, string> = {
  asin: "ASIN",
  sku: "SKU",
  clientIdCode: "ClientIDCode",
};

/**
 * Returns which computed fields need recomputing after a field change.
 * Accepts either a bqName ("ASIN") or a coreField name ("asin").
 */
export function getTriggeredComputedFields(
  changedBqName: string,
  changedCoreField?: string | null
): string[] {
  const triggered: string[] = [];
  const bq = changedBqName;
  const coreBq = changedCoreField ? CORE_TO_BQ[changedCoreField] : undefined;

  if (UUID_DEPS.has(bq) || (coreBq && UUID_DEPS.has(coreBq))) {
    triggered.push("UUID");
  }
  if (ASIN_DEPS.has(bq) || (coreBq && ASIN_DEPS.has(coreBq))) {
    triggered.push("AmazonPDPURL");
  }
  if (SUMMARIZED_TITLE_DEPS.has(bq)) {
    triggered.push("SummarizedTitle");
  }
  return triggered;
}

export function computeUUID(
  asin: string | null,
  sku: string | null,
  clientIdCode: string | null
): string {
  return [asin || "", sku || "", clientIdCode || ""].join("_");
}

export function computeAmazonPdpUrl(asin: string | null): string {
  if (!asin || asin.trim() === "") return "";
  return `https://www.amazon.com/dp/${asin}`;
}

export function computeSummarizedTitle(
  variationProduct: string | null,
  style: string | null,
  flavor: string | null,
  color: string | null,
  size: string | null
): string {
  return [variationProduct, style, flavor, color, size]
    .filter((p) => p != null && p.trim() !== "")
    .join("|");
}

/**
 * Theme-aware Summarized Title — the canonical form used by the PDP and list views.
 *
 * Result shape: {VariationName} | {attr1} | {attr2}…
 * where attrs are dictated by the product's Variation Theme Name (e.g. COLOR/SIZE
 * → [Color, Size]; FLAVOR/SIZE → [Flavor, Size]).
 *
 * Returns "" if there's nothing meaningful to display. Callers decide whether to
 * fall back to ItemName.
 */
import { lookupThemeAttrs } from "./variation-themes";

const SUMMARIZED_TITLE_ATTRS = ["Flavor", "Size", "Color", "Style"] as const;

export function computeThemeSummarizedTitle(
  themeName: string | null | undefined,
  variationName: string | null | undefined,
  attrs: {
    Color?: string | null;
    Size?: string | null;
    Flavor?: string | null;
    Style?: string | null;
  }
): string {
  const themeAttrs = lookupThemeAttrs(themeName);
  const parts: string[] = [];
  if (variationName && variationName.trim() !== "") parts.push(variationName.trim());
  // Unmapped themes (e.g. SIZE/SET) still include any populated variation attrs
  // so Summarized Title is not just the variation name.
  const keys = themeAttrs
    ? [...themeAttrs]
    : SUMMARIZED_TITLE_ATTRS.filter((k) => attrs[k]?.trim());
  for (const attr of keys) {
    const v = attrs[attr as keyof typeof attrs];
    if (v != null && v.trim() !== "") parts.push(v.trim());
  }
  return parts.join(" | ");
}

export type ThemeAttrBag = {
  Color?: string | null;
  Size?: string | null;
  Flavor?: string | null;
  Style?: string | null;
};

function themeAttrsPopulated(attrs: ThemeAttrBag | Record<string, string> | null | undefined): boolean {
  if (!attrs) return false;
  return SUMMARIZED_TITLE_ATTRS.some((k) => {
    const v = (attrs as Record<string, string | null | undefined>)[k];
    return v != null && String(v).trim() !== "";
  });
}

/**
 * Fill empty Color/Size/Flavor/Style from a same-ASIN or SKU-without-FBM sibling.
 * FBM duplicate rows often have a blank variations blob; the FBA twin has the print.
 */
export function coalesceThemeAttrs<
  T extends {
    id?: string;
    asin?: string | null;
    sku?: string | null;
    variations?: ThemeAttrBag | Record<string, string> | null;
  },
>(product: T, siblings: T[]): ThemeAttrBag {
  const own = (product.variations ?? {}) as ThemeAttrBag;
  if (themeAttrsPopulated(own)) {
    return {
      Color: own.Color ?? null,
      Size: own.Size ?? null,
      Flavor: own.Flavor ?? null,
      Style: own.Style ?? null,
    };
  }
  const baseSku = product.sku?.replace(/-FBM$/i, "");
  const donor = siblings.find((s) => {
    if (s === product || (s.id && product.id && s.id === product.id)) return false;
    if (!themeAttrsPopulated(s.variations)) return false;
    if (product.asin && s.asin && s.asin === product.asin) return true;
    if (baseSku && s.sku === baseSku) return true;
    return false;
  });
  const src = (donor?.variations ?? {}) as ThemeAttrBag;
  return {
    Color: src.Color ?? null,
    Size: src.Size ?? null,
    Flavor: src.Flavor ?? null,
    Style: src.Style ?? null,
  };
}

/**
 * Display Summarized Title for list/PDP views.
 *
 * Prefer theme-aware VariationName | attr… even when attrs are empty (variation
 * name alone). Never fall back to Amazon itemName when a variation name exists —
 * itemName is marketing copy (feature bullets) and SplitTitle would treat those
 * bullets as variation axes.
 */
export function displaySummarizedTitle(input: {
  variationThemeName?: string | null;
  variationName?: string | null;
  Color?: string | null;
  Size?: string | null;
  Flavor?: string | null;
  Style?: string | null;
  summarizedTitle?: string | null;
  itemName?: string | null;
}): string | null {
  const computed = computeThemeSummarizedTitle(input.variationThemeName, input.variationName, {
    Color: input.Color,
    Size: input.Size,
    Flavor: input.Flavor,
    Style: input.Style,
  });
  if (computed) return computed;
  const stored = input.summarizedTitle?.trim() || "";
  if (stored) return stored;
  return input.itemName?.trim() || null;
}
