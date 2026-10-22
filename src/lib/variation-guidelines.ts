export type ContentGuidelines = {
  keyFeatures?: string[];
  messagingAngle?: string[];
  targetAudience?: string[];
  doList?: string[];
  dontList?: string[];
};

/** True when at least one field contains meaningful data */
export function isGuidelinesPresent(gl: ContentGuidelines | null | undefined): gl is ContentGuidelines {
  if (!gl) return false;
  return (
    (Array.isArray(gl.keyFeatures)     && gl.keyFeatures.length > 0)     ||
    (Array.isArray(gl.messagingAngle)  && gl.messagingAngle.length > 0)  ||
    (Array.isArray(gl.targetAudience)  && gl.targetAudience.length > 0)  ||
    (Array.isArray(gl.doList)          && gl.doList.length > 0)          ||
    (Array.isArray(gl.dontList)        && gl.dontList.length > 0)
  );
}

function pickArray(
  ...tiers: (string[] | null | undefined)[]
): string[] | undefined {
  for (const v of tiers) {
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Resolves effective guidelines field-by-field across up to 4 tiers.
 * Each field independently picks the highest-priority non-empty value:
 *   listing → group → variation → brand
 * Brand is a typed tier-0 fallback. Brand free-text (clients.brand_guidelines) is
 * passed separately into the SOURCE FACTS block — this argument is reserved for
 * future structured brand guidelines.
 */
export function resolveGuidelinesFieldByField(
  listing:   ContentGuidelines | null | undefined,
  group:     ContentGuidelines | null | undefined,
  variation: ContentGuidelines | null | undefined,
  brand?:    ContentGuidelines | null,
): ContentGuidelines | null {
  const result: ContentGuidelines = {
    messagingAngle: pickArray(listing?.messagingAngle, group?.messagingAngle, variation?.messagingAngle, brand?.messagingAngle),
    targetAudience: pickArray(listing?.targetAudience, group?.targetAudience, variation?.targetAudience, brand?.targetAudience),
    keyFeatures:    pickArray(listing?.keyFeatures,    group?.keyFeatures,    variation?.keyFeatures,    brand?.keyFeatures),
    doList:         pickArray(listing?.doList,         group?.doList,         variation?.doList,         brand?.doList),
    dontList:       pickArray(listing?.dontList,       group?.dontList,       variation?.dontList,       brand?.dontList),
  };
  return isGuidelinesPresent(result) ? result : null;
}

/** @deprecated Use resolveGuidelinesFieldByField. Kept for backward compatibility. */
export function resolveGuidelines(
  groupGuidelines:    ContentGuidelines | null | undefined,
  variationDefaults:  ContentGuidelines | null | undefined,
): ContentGuidelines | null {
  return resolveGuidelinesFieldByField(null, groupGuidelines, variationDefaults);
}

export type GuidelineTier = "listing" | "group" | "variation" | "brand";
export type GuidelineTierMap = Partial<Record<keyof ContentGuidelines, GuidelineTier>>;

/** Same resolution as resolveGuidelinesFieldByField but also returns which tier won each field. */
export function resolveGuidelinesWithTiers(
  listing:   ContentGuidelines | null | undefined,
  group:     ContentGuidelines | null | undefined,
  variation: ContentGuidelines | null | undefined,
  brand?:    ContentGuidelines | null,
): { resolved: ContentGuidelines | null; tiers: GuidelineTierMap } {
  const tiers: GuidelineTierMap = {};
  const pickWithTier = (key: keyof ContentGuidelines) => {
    const sources: Array<[GuidelineTier, string[] | undefined]> = [
      ["listing", listing?.[key] as string[] | undefined],
      ["group", group?.[key] as string[] | undefined],
      ["variation", variation?.[key] as string[] | undefined],
      ["brand", brand?.[key] as string[] | undefined],
    ];
    for (const [tier, arr] of sources) {
      if (Array.isArray(arr) && arr.length > 0) {
        tiers[key] = tier;
        return arr;
      }
    }
    return undefined;
  };
  const result: ContentGuidelines = {
    messagingAngle: pickWithTier("messagingAngle"),
    targetAudience: pickWithTier("targetAudience"),
    keyFeatures:    pickWithTier("keyFeatures"),
    doList:         pickWithTier("doList"),
    dontList:       pickWithTier("dontList"),
  };
  return { resolved: isGuidelinesPresent(result) ? result : null, tiers };
}

/** Renders ContentGuidelines as a SOURCE FACTS block for Claude prompts. */
export function renderGuidelinesBlock(gl: ContentGuidelines, tiers?: GuidelineTierMap): string {
  const tag = (key: keyof ContentGuidelines) => (tiers?.[key] ? ` [${tiers[key]}]` : "");
  const lines: string[] = ["## SOURCE FACTS — resolved cascade (listing → group → variation → brand)"];
  if (gl.messagingAngle?.length) lines.push(`Messaging angle${tag("messagingAngle")}: ${gl.messagingAngle.join(", ")}`);
  if (gl.targetAudience?.length) lines.push(`Target audience${tag("targetAudience")}: ${gl.targetAudience.join(", ")}`);
  if (gl.keyFeatures?.length)    lines.push(`Key features${tag("keyFeatures")}: ${gl.keyFeatures.join(", ")}`);
  if (gl.doList?.length)         lines.push(`Do${tag("doList")}: ${gl.doList.join(", ")}`);
  if (gl.dontList?.length)       lines.push(`Don't${tag("dontList")}: ${gl.dontList.join(", ")}`);
  return lines.join("\n");
}
