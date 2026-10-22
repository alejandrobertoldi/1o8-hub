import type { StorefrontModuleType } from "./module-specs";

const pad2 = (n: number) => String(n).padStart(2, "0");

export function storefrontAssetFilename(a: {
  clientIdCode: string; slug: string; position: number; moduleType: StorefrontModuleType; ext: string;
  slot?: "main" | "poster"; tilePosition?: number;
}): string {
  const suffix = a.slot === "poster" ? "_cover" : "";
  const tilePart = a.tilePosition !== undefined ? `_T${pad2(a.tilePosition)}` : "";
  return `${a.clientIdCode}_storefront_${a.slug}_M${pad2(a.position)}${tilePart}_${a.moduleType}${suffix}.${a.ext}`;
}
