export const ALT_TEXT_MAX = 100;
export const SUGGESTION_MAX = 300;

export type BrandStoryAltTextPromptInput = {
  slotLabel: string;
  headline?: string;
  body?: string;
  currentAlt?: string;
  suggestion?: string;
  hasImage: boolean;
};

function clip(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

export function buildBrandStoryAltTextPrompt(
  input: BrandStoryAltTextPromptInput
): string {
  const headline = clip(input.headline, 200);
  const body = clip(input.body, 500);
  const currentAlt = clip(input.currentAlt, ALT_TEXT_MAX);
  const suggestion = clip(input.suggestion, SUGGESTION_MAX);

  const contextParts: string[] = [`Image slot: ${input.slotLabel}`];
  if (headline) contextParts.push(`Headline on this module: "${headline}"`);
  if (body) contextParts.push(`Body text on this module: "${body}"`);
  if (currentAlt) contextParts.push(`Current alt text: "${currentAlt}"`);
  if (suggestion) {
    contextParts.push(
      `Editor guidance — you MUST incorporate these details or changes: "${suggestion}"`
    );
  }

  const guidanceRule = suggestion
    ? `- The editor's guidance is the revision request and TAKES PRIORITY over the current alt text.
- The rewritten alt MUST clearly include those requested details. Do not return the current alt unchanged.
- Drop less-important wording from the current alt if needed to fit the 100-character limit while keeping the guidance.
- Do not invent details that are not in the image or in the editor's guidance`
    : "";

  const sharedRequirements = `Requirements:
- Max ${ALT_TEXT_MAX} characters (Amazon strict limit — count carefully)
- Describe what is VISUALLY shown: product, brand elements, lifestyle scene, or logo
- Optimize for Amazon's COSMO and Alexa for Shopping: use specific, descriptive nouns and action/context words that help AI systems understand image semantics
- No generic filler ("image of", "picture of", "photo showing", "a person")
- Do NOT invent content that isn't visible — be accurate
${guidanceRule}
- Return ONLY the alt text string, nothing else`;

  return input.hasImage
    ? `You are writing Amazon Brand Story alt text. Look at this image and describe what it shows.

${contextParts.join("\n")}

${sharedRequirements}`
    : `You are writing Amazon Brand Story alt text. No image is uploaded yet — generate a descriptive alt text based on the context below.

${contextParts.join("\n")}

${sharedRequirements}`;
}
