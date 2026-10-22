/**
 * Variation theme → attribute mapping.
 *
 * A product's Variation Theme Name (e.g. "COLOR/SIZE", "FLAVOR/SIZE", "COLOR")
 * declares which attributes participate in the SKU's variation axis.
 * The Set's insertion order is the canonical display order.
 *
 * Used by:
 *   - listing-identity-section.tsx (live Summarized Title in PDP)
 *   - variation-section.tsx (which Color/Size/Flavor/Style rows to enable)
 *   - computed-fields.ts → computeThemeSummarizedTitle (server-side persistence)
 */
export const THEME_FIELD_MAP: Record<string, Set<string>> = {
  COLOR: new Set(["Color"]),
  Color: new Set(["Color"]),
  "COLOR_NAME": new Set(["Color"]),
  SIZE: new Set(["Size"]),
  Size: new Set(["Size"]),
  "SIZE_NAME": new Set(["Size"]),
  SizeName: new Set(["Size"]),
  STYLE: new Set(["Style"]),
  Style: new Set(["Style"]),
  "STYLE_NAME": new Set(["Style"]),
  StyleName: new Set(["Style"]),
  FLAVOR: new Set(["Flavor"]),
  FLAVOR_NAME: new Set(["Flavor"]),
  Flavor: new Set(["Flavor"]),
  FlavorName: new Set(["Flavor"]),
  PATTERN: new Set(["Color"]),
  PATTERN_NAME: new Set(["Color"]),
  "COLOR/SIZE": new Set(["Color", "Size"]),
  "SIZE/COLOR": new Set(["Color", "Size"]),
  "COLOR_NAME/SIZE_NAME": new Set(["Color", "Size"]),
  "SIZE_NAME/COLOR_NAME": new Set(["Color", "Size"]),
  "SIZE/COLOR_NAME": new Set(["Color", "Size"]),
  "SIZE_NAME/COLOR": new Set(["Color", "Size"]),
  "COLOR/SIZE_NAME": new Set(["Color", "Size"]),
  "COLOR_NAME/SIZE": new Set(["Color", "Size"]),
  "color-size": new Set(["Color", "Size"]),
  "size-color": new Set(["Color", "Size"]),
  "COLOR/FLAVOR": new Set(["Color", "Flavor"]),
  "FLAVOR/COLOR": new Set(["Color", "Flavor"]),
  "COLOR_NAME/FLAVOR_NAME": new Set(["Color", "Flavor"]),
  "FLAVOR_NAME/COLOR_NAME": new Set(["Color", "Flavor"]),
  "FLAVOR/SIZE": new Set(["Flavor", "Size"]),
  "SIZE/FLAVOR": new Set(["Flavor", "Size"]),
  "FLAVOR_NAME/SIZE_NAME": new Set(["Flavor", "Size"]),
  "SIZE_NAME/FLAVOR_NAME": new Set(["Flavor", "Size"]),
  "FLAVOR/SIZE_NAME": new Set(["Flavor", "Size"]),
  "SIZE/FLAVOR_NAME": new Set(["Flavor", "Size"]),
  "Flavor-Size": new Set(["Flavor", "Size"]),
  "FlavorSize": new Set(["Flavor", "Size"]),
  "FlavorName-SizeName": new Set(["Flavor", "Size"]),
  "Size-Flavor": new Set(["Flavor", "Size"]),
  "SIZE/STYLE": new Set(["Size", "Style"]),
  "STYLE/SIZE": new Set(["Size", "Style"]),
  "SIZE_NAME/STYLE_NAME": new Set(["Size", "Style"]),
  "STYLE_NAME/SIZE_NAME": new Set(["Size", "Style"]),
  "SIZE/STYLE_NAME": new Set(["Size", "Style"]),
  "STYLE/SIZE_NAME": new Set(["Size", "Style"]),
  "COLOR/STYLE": new Set(["Color", "Style"]),
  "STYLE/COLOR": new Set(["Color", "Style"]),
  "COLOR_NAME/STYLE_NAME": new Set(["Color", "Style"]),
  "STYLE_NAME/COLOR_NAME": new Set(["Color", "Style"]),
  "stylename-color": new Set(["Style", "Color"]),
  "color-stylename": new Set(["Color", "Style"]),
  "size-sizename": new Set(["Size"]),
  "itemform-sizename": new Set(["Size"]),
  "sizename-itemform": new Set(["Size"]),
  "sizeitemform": new Set(["Size"]),
};

/** Look up theme attributes, with case-insensitive fallback. */
export function lookupThemeAttrs(themeName: string | null | undefined): Set<string> | undefined {
  if (!themeName) return undefined;
  return THEME_FIELD_MAP[themeName] ?? THEME_FIELD_MAP[themeName.toUpperCase()];
}
