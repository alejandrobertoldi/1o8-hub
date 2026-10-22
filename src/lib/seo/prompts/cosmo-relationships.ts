// src/lib/seo/prompts/cosmo-relationships.ts
// v5 §5.3 — 16 relationship categories. ALL must be evaluated per ASIN.

export const COSMO_RELATIONSHIPS = [
  "USED_FOR_FUNC",
  "USED_TO",
  "CAPABLE_OF",
  "USED_FOR_EVE",
  "USED_ON",
  "USED_IN_LOC",
  "USED_AS",
  "IS_A",
  "xIS_A",
  "USED_IN_BODY",
  "USED_WITH",
  "USED_FOR_AUD",
  "USED_BY",
  "xINTERESTED_IN",
  "xWANT",
  "xLIKES",
] as const;

export type CosmoRelationship = typeof COSMO_RELATIONSHIPS[number];

export const COSMO_RELATIONSHIP_DEFINITIONS: Record<CosmoRelationship, string> = {
  USED_FOR_FUNC: "Product → primary function it performs",
  USED_TO: "Product → action verb the user takes",
  CAPABLE_OF: "Product → capability or feature it enables",
  USED_FOR_EVE: "Product → event or occasion of use",
  USED_ON: "Product → surface, material, or object it is applied to",
  USED_IN_LOC: "Product → physical location of use",
  USED_AS: "Product → role or substitute it serves",
  IS_A: "Product → category or type it belongs to",
  xIS_A: "Product → category it explicitly is NOT",
  USED_IN_BODY: "Product → body area or system targeted",
  USED_WITH: "Product → companion or accessory paired with",
  USED_FOR_AUD: "Product → audience segment it serves",
  USED_BY: "Product → user persona or role",
  xINTERESTED_IN: "Product → adjacent interest the buyer holds",
  xWANT: "Product → desire or aspiration the buyer has",
  xLIKES: "Product → preference signal of buyer",
};
