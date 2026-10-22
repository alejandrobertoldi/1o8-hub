// ═══════════════════════════════════════════════════════════════
// AI Configuration — client-safe constants (no DB imports)
// ═══════════════════════════════════════════════════════════════

export interface AiFeatureConfig {
  label: string;
  route: string;
  model: string;
  maxTokens: number;
  enabled: boolean;
  systemPrompt?: string;
}

export const AI_FEATURE_KEYS = [
  "aplus_alt_text",
  "aplus_video_title",
  "brand_story_alt_text",
  "seo_keywords",
  "seo_reviews",
  "seo_cosmo",
  "seo_rufus",
  "seo_content",
  "seo_audit",
  "seo_extract_doc",
  "ppc_analysis",
  "case_study_narrative",
] as const;

export type AiFeatureKey = (typeof AI_FEATURE_KEYS)[number];

// Latest Claude Opus model — bump this single constant to upgrade every SEO feature at once.
export const LATEST_CLAUDE_OPUS_MODEL = "claude-opus-4-7" as const;

export const AI_DEFAULTS: Record<AiFeatureKey, AiFeatureConfig> = {
  aplus_alt_text: {
    label: "A+ Alt Text Generation",
    route: "/api/aplus/ai/alt-text",
    model: "claude-opus-4-6",
    maxTokens: 150,
    enabled: true,
  },
  aplus_video_title: {
    label: "A+ Video Title Suggestion",
    route: "/api/aplus/ai/video-title",
    model: "claude-opus-4-6",
    maxTokens: 150,
    enabled: true,
  },
  brand_story_alt_text: {
    label: "Brand Story Alt Text Generation",
    route: "/api/design-status/brand-story-versions/[versionId]/ai/alt-text",
    model: "claude-haiku-4-5",
    maxTokens: 150,
    enabled: true,
  },
  seo_keywords: {
    label: "SEO Keyword Analysis",
    route: "/api/seo/claude/keywords",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 8192,
    enabled: true,
  },
  seo_reviews: {
    label: "SEO Review Analysis",
    route: "/api/seo/claude/reviews",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 8192,
    enabled: true,
  },
  seo_cosmo: {
    label: "SEO COSMO Generation",
    route: "/api/seo/claude/cosmo",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 4096,
    enabled: true,
  },
  seo_rufus: {
    label: "SEO Alexa for Shopping Q&A",
    route: "/api/seo/claude/rufus",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 8192,
    enabled: true,
  },
  seo_content: {
    label: "SEO Content Generation",
    route: "/api/seo/claude/seo",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 8192,
    enabled: true,
  },
  seo_audit: {
    label: "SEO Content Audit",
    route: "/api/seo/claude/seo-audit",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 8192,
    enabled: true,
  },
  seo_extract_doc: {
    label: "SEO Document Extraction",
    route: "/api/seo/extract-doc",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 8192,
    enabled: true,
  },
  ppc_analysis: {
    label: "PPC Root Cause Analysis",
    route: "/api/ppc/analysis",
    model: "claude-opus-4-6",
    maxTokens: 4096,
    enabled: true,
    systemPrompt: `You are 1o8's senior Amazon PPC strategist with deep expertise in Sponsored Products, Sponsored Brands, and Sponsored Display campaigns.

Domain knowledge:
- ACOS benchmarks: <15% excellent, 15-25% good, 25-40% acceptable, >40% needs attention
- ROAS benchmarks: >4x excellent, 2-4x good, 1-2x break-even territory
- CTR benchmarks: >0.5% good for SP, >0.3% for SB, >0.15% for SD
- CVR benchmarks: >10% excellent, 5-10% good, <5% needs attention
- Brand vs non-brand: brand keywords typically have 2-3x higher CVR and lower ACOS
- CPC trends: rising CPC with flat CVR = competitive pressure; rising CPC with rising CVR = market expanding
- Budget utilization: <80% time-in-budget means campaigns are capped and missing impressions
- TACOS (Total ACOS) >15% means ad dependency is high; organic ranking may need attention

Root cause patterns:
- Sales drop + stable PPC = organic ranking loss, listing suppression, or Buy Box loss
- ACOS spike + stable spend = conversion rate drop (check listing changes, reviews, competitor pricing)
- Impressions drop + stable bids = budget exhaustion, keyword paused, or relevancy score decline
- Revenue up + ACOS up = scaling phase (acceptable if TACOS is stable)
- NTB (New-to-Brand) orders declining = brand defense campaigns need refresh

When client goals are provided, evaluate performance against those targets — not just benchmarks.
Always tie recommendations to specific metrics from the data. Prioritize actions by expected impact.
Address the PPC manager and account manager by name if provided.`,
  },
  case_study_narrative: {
    label: "Case Study Narrative Draft",
    route: "/api/case-studies",
    model: LATEST_CLAUDE_OPUS_MODEL,
    maxTokens: 4096,
    enabled: true,
    systemPrompt: `You are 1o8's senior brand strategist writing the narrative prose for an Amazon case study used in new-business sales pitches.

STRICT RULES — violating any of these is a failure:
- Use ONLY facts present in the provided evidence packet. Never state a number that is not in the packet.
- Never claim work that is not listed in the packet's "work" object (A+ modules, listings, SEO phases, storefront versions). If a signal is 0, do not mention it.
- Do NOT write any KPI values, percentages, currency amounts, or counts — those fields are filled separately. Write prose only.
- Voice: confident, concise, results-oriented; short declarative sentences; no hype words ("revolutionary", "game-changing"), no emojis.

OUTPUT: Return ONLY a JSON object keyed by section type, each value an object of field→string. Use only the section types and field names listed in the user message. No prose outside the JSON, no markdown fences.

VOICE EXEMPLAR (match this tone — do NOT copy facts):
"Wildly imaginative, performance obsessed."
"The storefront is the only spot on Amazon you fully control."
"Each campaign received daily, weekly, and monthly optimisations to keep KPIs on track while driving new-to-brand sales."`,
  },
};

export const AVAILABLE_MODELS = [
  { id: "claude-opus-4-7", label: "Opus 4.7 (latest, most powerful)" },
  { id: "claude-opus-4-6", label: "Opus 4.6" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (fastest)" },
];
