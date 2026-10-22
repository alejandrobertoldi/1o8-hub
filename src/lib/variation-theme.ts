/* eslint-disable react-doctor/js-flatmap-filter */
/**
 * Parse Amazon's variation_theme_name into its constituent attribute names.
 *
 * Examples:
 *   "Color/Size"   → ["Color", "Size"]
 *   "ColorSize"    → ["Color", "Size"]   (Amazon's PascalCase fused form)
 *   "Flavor"       → ["Flavor"]
 *   null / ""      → []
 */
export function parseVariationTheme(theme: string | null | undefined): string[] {
  if (!theme) return [];
  if (theme.includes("/")) return theme.split("/").map((s) => s.trim()).filter(Boolean);
  // Split PascalCase ("ColorSize" → ["Color", "Size"]) by inserting a delimiter
  // before each uppercase letter that follows a lowercase letter.
  const split = theme.replace(/([a-z])([A-Z])/g, "$1|$2").split("|");
  return split.map((s) => s.trim()).filter(Boolean);
}

export interface VariationProductLike { variationThemeName: string | null | undefined }
export interface VariationAttributeLike { generalLabel: string }

export function isVariationAttribute(
  product: VariationProductLike,
  attribute: VariationAttributeLike,
): boolean {
  return parseVariationTheme(product.variationThemeName).includes(attribute.generalLabel);
}

const AXIS_ALIASES: Record<string, string> = {
  color: "Color",
  colorname: "Color",
  size: "Size",
  sizename: "Size",
  style: "Style",
  stylename: "Style",
  flavor: "Flavor",
  flavorname: "Flavor",
  pattern: "Pattern",
  patternname: "Pattern",
  itemform: "ItemForm",
};

function canonicalizeAxis(token: string): string {
  const key = token.replace(/[_\s-]/g, "").toLowerCase();
  if (AXIS_ALIASES[key]) return AXIS_ALIASES[key];
  const stripped = key.replace(/name$/, "");
  if (stripped !== key && AXIS_ALIASES[stripped]) return AXIS_ALIASES[stripped];
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/**
 * Ordered variation-theme axes for VariationAttribute1/2/3.
 * "COLOR/SIZE" → ["Color", "Size"]; unused slots are "".
 */
export function variationAttributeSlots(
  theme: string | null | undefined,
): [string, string, string] {
  if (!theme?.trim()) return ["", "", ""];
  const segments = theme.split(/[/\-]/).map((s) => s.trim()).filter(Boolean);
  const axes: string[] = [];
  for (const seg of segments) {
    const pascal = seg.replace(/([a-z])([A-Z])/g, "$1|$2").split("|");
    if (pascal.length === 2 && pascal[1].toLowerCase() === "name") {
      axes.push(canonicalizeAxis(seg));
    } else {
      for (const part of pascal) axes.push(canonicalizeAxis(part));
    }
  }
  const filled = axes.filter(Boolean).slice(0, 3);
  return [filled[0] ?? "", filled[1] ?? "", filled[2] ?? ""];
}
