// SEO project naming, aligned with the A+ convention (src/lib/aplus2/drive-naming.ts).
//
//   {client}_{scopeToken}_SEO_V##
//     ASIN (one)    REA_SC_US_B0CLMBGMS6_SEO_V01
//     ASIN (many)   REA_SC_US_3ASINs_SEO_V01
//     VARIATION     REA_SC_US_01_SEO_V01        (variation id minus its client prefix)
//     GROUP         REA_SC_US_G01_Choc_SEO_V01  (G## resolved by the server)
//
// The client builds the base (no version); the server resolves G## and V##
// (src/lib/seo/project-version-name.ts). Names created before this convention
// keep their old `…_vNN` form and their `SEO-{name}` Drive doc.

import { aplusGroupLabelToken } from "@/lib/aplus2/variation-scope";

export type SeoTargetScope = "ASIN" | "VARIATION" | "GROUP";

export const SEO_CONTENT_TOKEN = "SEO";
/** Replaced server-side with G01, G02… (reused when the same label already exists). */
export const GROUP_PLACEHOLDER = "G##";

/**
 * "REA_SC_US_01" → "01". Variation ids embed a client code, which can be stale
 * (DRC_SC_US_01 after the DRC → REA rename), so the name always takes the
 * client code from the project and only the suffix from the variation id.
 */
export function variationSuffix(variationId: string): string {
  const m = /^[A-Z0-9]+_[A-Z]{2}_[A-Z]{2}_(.+)$/.exec(variationId.trim());
  return m ? m[1] : variationId.trim();
}

export function buildSeoProjectBaseName(args: {
  clientIdCode: string;
  scope: SeoTargetScope;
  /** ASINs in the selection (parent first for VARIATION). */
  asins: string[];
  variationId?: string | null;
  parentAsin?: string | null;
  groupLabel?: string | null;
}): string {
  const { clientIdCode: c, scope, asins } = args;
  let token: string;
  if (scope === "VARIATION") {
    token = args.variationId?.trim()
      ? variationSuffix(args.variationId)
      : args.parentAsin || asins[0] || "Variation";
  } else if (scope === "GROUP") {
    token = `${GROUP_PLACEHOLDER}_${aplusGroupLabelToken(args.groupLabel || "Group")}`;
  } else {
    token = asins.length === 1 ? asins[0] : `${asins.length}ASINs`;
  }
  return `${c}_${token}_${SEO_CONTENT_TOKEN}`;
}

/** True for names that follow this convention (and so get a Drive folder). */
export function isFolderConventionName(name: string): boolean {
  return /_SEO_V\d+$/.test(name);
}

/**
 * Where an export lands inside the brand folder. New-convention projects get a
 * `{name}/` folder holding a `{name}` doc; legacy projects keep `SEO-{name}` in
 * the brand folder, because re-export deletes the previous doc by exact name.
 */
export function seoExportTarget(projectName: string): { folderName: string | null; docName: string } {
  const safe = projectName.replace(/[/\\?%*:|"<>]/g, "-").trim();
  return isFolderConventionName(projectName)
    ? { folderName: safe, docName: safe }
    : { folderName: null, docName: `SEO-${safe}` };
}
