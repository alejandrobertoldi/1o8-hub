import type Anthropic from "@anthropic-ai/sdk";

export const BRAND_BOOK_TO_MD_PROMPT = `You are converting raw text extracted from a brand book PDF into clean, well-structured Markdown.

Preserve all section headings, lists, and tables. Remove page numbers, running headers, footers, and orphan whitespace. Keep all substantive content — colors, hex values, font names, voice descriptors, logo guidance, dos and don'ts.

If a section is unclear or appears garbled (e.g. OCR artifacts, broken table layout), leave it as a quoted code block rather than guessing.

Do NOT invent content. If a section is missing, omit it. If unsure whether something is a heading or body text, prefer body text.

Output only the markdown — no preamble, no postscript, no explanations.`;

export const BRAND_BOOK_SUMMARY_PROMPT = `You are reading a brand book in Markdown. Extract structured fields and call the \`save_summary\` tool exactly once.

Fields to extract:
- logo: descriptions of primary / secondary / monochrome variants (text only — no image cropping), clearspace rules, misuse rules
- colors: every formal palette color with role, name, hex, rgb (if present), cmyk (if present), and tier — the named palette/group the color belongs to as labelled in the brand book (e.g. "Evergreen Palette", "Comfort Palette", "Color Palette I", "Primary Palette"). If a brand book groups colors into multiple named palettes (e.g. "Color Palette I" and "Color Palette II", or "Primary" and "Secondary" palettes), preserve that grouping by setting tier to the exact palette name from the document. If colors are presented as a single ungrouped list, set tier to null.
- typography: primary and secondary typefaces with family name, weights, and web-safe fallback (if present)
- voice: brand voice attributes, dos, don'ts, and one short sample-copy excerpt (if present)

If a field is not present in the document, return null for nullable fields and an empty array for list fields. Do NOT invent values, brand colors, font names, or voice descriptors that aren't in the document.

Call \`save_summary\` exactly once with the complete payload.`;

// Anthropic Tool input_schema — JSON Schema flavor, NOT Zod.
// Must match types.ts SummaryAll. Kept hand-rolled to satisfy
// the SDK's expected shape and to enforce strict validation server-side.
export const BRAND_SUMMARY_TOOL_SCHEMA: Anthropic.Tool["input_schema"] = {
  type: "object",
  required: ["logo", "colors", "typography", "voice"],
  properties: {
    logo: {
      type: "object",
      required: [
        "primary_description",
        "secondary_description",
        "monochrome_description",
        "clearspace_notes",
        "misuse_notes",
        "primary_url",
        "secondary_url",
        "monochrome_url",
      ],
      properties: {
        primary_description: { type: ["string", "null"] },
        secondary_description: { type: ["string", "null"] },
        monochrome_description: { type: ["string", "null"] },
        clearspace_notes: { type: ["string", "null"] },
        misuse_notes: { type: ["string", "null"] },
        primary_url: { type: ["string", "null"] },
        secondary_url: { type: ["string", "null"] },
        monochrome_url: { type: ["string", "null"] },
      },
    },
    colors: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "tier", "name", "hex", "rgb", "cmyk"],
        properties: {
          role: { type: "string", enum: ["primary", "secondary", "accent", "neutral"] },
          tier: { type: ["string", "null"] },
          name: { type: "string" },
          hex: { type: "string" },
          rgb: { type: ["string", "null"] },
          cmyk: { type: ["string", "null"] },
        },
      },
    },
    typography: {
      type: "object",
      required: ["primary", "secondary"],
      properties: {
        primary: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              required: ["family", "weights", "fallback"],
              properties: {
                family: { type: "string" },
                weights: { type: "array", items: { type: "string" } },
                fallback: { type: ["string", "null"] },
              },
            },
          ],
        },
        secondary: {
          anyOf: [
            { type: "null" },
            {
              type: "object",
              required: ["family", "weights", "fallback"],
              properties: {
                family: { type: "string" },
                weights: { type: "array", items: { type: "string" } },
                fallback: { type: ["string", "null"] },
              },
            },
          ],
        },
      },
    },
    voice: {
      type: "object",
      required: ["attributes", "dos", "donts", "sample_copy"],
      properties: {
        attributes: { type: "array", items: { type: "string" } },
        dos: { type: "array", items: { type: "string" } },
        donts: { type: "array", items: { type: "string" } },
        sample_copy: { type: ["string", "null"] },
      },
    },
  },
};
