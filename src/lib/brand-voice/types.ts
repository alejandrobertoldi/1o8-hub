import { z } from "zod";

/**
 * Per-client brand voice + SEO writing context. The field set mirrors the
 * 1o8 SEO blog tool (~/Documents/1o8/Ops/SEO/seo-writer: clients/<slug>/
 * brand.md, keywords.md, product-facts.md, internal-links.md) so both tools
 * describe a client the same way and the hub can be the single home for it.
 */

export const PERSONALITY_TRAITS = [
  "practical",
  "educational",
  "reassuring",
  "playful",
  "authoritative",
  "conversational",
  "bold",
  "minimal",
] as const;

export const KEYWORD_INTENTS = ["informational", "commercial", "transactional", "navigational"] as const;
export const KEYWORD_PRIORITIES = ["high", "medium", "low"] as const;

const text = z.string().max(20_000).default("");
const url = z.string().max(2_000).default("");

export const brandVoiceSchema = z.object({
  blogUrl: url,
  platform: z.string().max(200).default(""),
  valueProp: text,
  whyExists: text,
  tone: text,
  personality: z.array(z.string().max(60)).max(20).default([]),
  audience: z
    .object({ floor: text, middle: text, ceiling: text })
    .default({ floor: "", middle: "", ceiling: "" }),
  voiceExamples: z.array(z.object({ offBrand: text, onBrand: text })).max(50).default([]),
  signaturePhrases: z.array(z.string().max(500)).max(200).default([]),
  bannedPhrases: z.array(z.string().max(500)).max(200).default([]),
  competitors: z.array(z.object({ name: z.string().max(200).default(""), url })).max(50).default([]),
  referencePosts: z.array(z.string().max(2_000)).max(100).default([]),
  keywords: z
    .array(
      z.object({
        keyword: z.string().max(300),
        volume: z.number().int().nonnegative().nullable().default(null),
        kd: z.number().int().min(0).max(100).nullable().default(null),
        intent: z.string().max(40).default(""),
        priority: z.string().max(20).default(""),
      }),
    )
    .max(1_000)
    .default([]),
  productFacts: z.string().max(200_000).default(""),
  productFactsScannedUrls: z.array(z.string().max(2_000)).max(500).default([]),
  internalLinks: z
    .array(z.object({ title: z.string().max(500).default(""), url, keyword: z.string().max(300).default("") }))
    .max(1_000)
    .default([]),
});

export type BrandVoice = z.infer<typeof brandVoiceSchema>;

export const EMPTY_BRAND_VOICE: BrandVoice = brandVoiceSchema.parse({});

/** Share of the core voice fields that are filled in, 0–100 (shown as a progress hint). */
export function brandVoiceCompleteness(v: BrandVoice): number {
  const checks = [
    !!v.valueProp.trim(),
    !!v.whyExists.trim(),
    !!v.tone.trim(),
    v.personality.length > 0,
    !!(v.audience.floor.trim() || v.audience.middle.trim() || v.audience.ceiling.trim()),
    v.voiceExamples.some((e) => e.offBrand.trim() && e.onBrand.trim()),
    v.signaturePhrases.length > 0 || v.bannedPhrases.length > 0,
    v.competitors.some((c) => c.name.trim() || c.url.trim()),
    v.keywords.length > 0,
    !!v.productFacts.trim(),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
