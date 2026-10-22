/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-set-map-lookups */
// ═══════════════════════════════════════════════════════════════
// 1o8 SEO Manager — Pipeline Configuration (Single Source of Truth)
// ═══════════════════════════════════════════════════════════════
//
// This file defines ALL rules, constraints, and limits for the
// 6-step SEO content generation pipeline. Every API route and
// validation function MUST reference this config instead of
// hardcoding values.
//
// To update a rule: change it HERE, and all routes + prompts
// will pick it up automatically.
//
// UI Header Convention:
//   First word → white (#FFFFFF)
//   Second word → orange (#E97E05)
//   Example: "KEYWORD" white + "TIERS" orange
// ═══════════════════════════════════════════════════════════════

// ── 1 CHARACTER & BYTE LIMITS ─────────────────────────────────
// NOTE: Model assignments are managed via ai-config.ts + DB overrides
// (see getAiFeatureConfig() in ai-config.server.ts). Do not duplicate here.

export const CHAR_LIMITS = {
  title: { min: 1, max: 75, unit: "chars" as const },
  item_highlight: { min: 1, max: 125, unit: "chars" as const },
  detailed_bullet: { min: 390, max: 400, unit: "chars" as const },
  concise_bullet: { min: 190, max: 200, unit: "chars" as const },
  content_bullet: { min: 90, max: 100, unit: "chars" as const },
  key_features_bullet: { min: 40, max: 50, unit: "chars" as const },
  description: { min: 1000, max: 1200, unit: "chars" as const },
  backend_search_terms: { min: 220, max: 250, unit: "bytes" as const },
} as const;

// ── 2 KEYWORD TIERS ───────────────────────────────────────────

export const KEYWORD_TIERS = {
  T1: {
    label: "High Purchase Intent",
    minCount: 5,
    maxCount: 8,
    matchType: "Exact" as const,
    primaryLocation: "Title" as const,
    buyerStageWeight: "Decision",
    description: "Core purchase-intent keywords placed in titles",
  },
  T2: {
    label: "Mid-Funnel",
    minCount: 10,
    maxCount: 15,
    matchType: "Phrase" as const,
    primaryLocation: "Bullet Points" as const,
    buyerStageWeight: "Consideration",
    description: "Supporting keywords for bullet points and descriptions",
  },
  T3: {
    label: "Semantic Expansion",
    minCount: 15,
    maxCount: 20,
    matchType: "Phrase" as const,
    primaryLocation: "Description" as const,
    buyerStageWeight: "Awareness",
    description: "Broader semantic keywords for description and backend",
  },
  T4: {
    label: "Long-Tail / Awareness",
    minCount: 0,
    maxCount: Infinity,
    matchType: "Broad" as const,
    primaryLocation: "Backend Search Terms" as const,
    buyerStageWeight: "Awareness",
    description: "Remaining keywords for backend search terms only",
  },
} as const;

export const KEYWORD_SCORING = {
  relevancy_weight: 0.45,
  volume_weight: 0.35,
  buyer_stage_weight: 0.20,
  buyer_stage_scores: {
    Decision: 1.0,
    Consideration: 0.7,
    Awareness: 0.4,
  },
} as const;

/** Which tiers feed into each content section */
export const TIER_TO_SECTION = {
  titles: ["T1"] as const,
  bullets: ["T1", "T2"] as const,
  description: ["T1", "T2", "T3"] as const,
  backend: ["T3", "T4"] as const,
} as const;

// ── 3 PROCESSING LIMITS ───────────────────────────────────────

export const PROCESSING_LIMITS = {
  /** Max keywords to process (200 product + 200 competitor) */
  max_keywords_total: 400,
  max_keywords_product: 200,
  max_keywords_competitor: 200,
  /** Keywords per parallel batch */
  keyword_batch_size: 100,

  /** Max reviews to process per request */
  max_reviews: 60,
  /** Max chars per review text */
  max_review_chars: 250,
  /** Client-side pre-trim: max reviews */
  client_pretrim_reviews: 30,
  /** Client-side pre-trim: max chars per review */
  client_pretrim_review_chars: 150,

  /** Alexa for Shopping Phase 2 question count */
  rufus_phase2_questions: { min: 8, max: 10 },

  /** COSMO rows — exactly 20, no more, no less */
  cosmo_rows: 20,
  /** COSMO usage explanation max words */
  cosmo_usage_max_words: 20,
  /** COSMO notes max words */
  cosmo_notes_max_words: 10,

  /** Max tokens for each API call */
  max_tokens: {
    keywords: 8192,
    reviews: 8192,
    rufus_generate: 2048,
    rufus_analyze: 8192,
    cosmo: 4096,
    seo: 8192,
    audit: 4000,
  },

  /** Keyword slice limits when loading for SEO generation */
  seo_keyword_load: {
    T1: 20,
    T2: 20,
    T3: 15,
    T4: 30,
  },

  /** Keyword slice limits for audit */
  audit_keyword_load: {
    T1: 15,
    T2: 15,
  },
  audit_cosmo_load: 15,
  audit_rufus_load: 5,
  audit_reviews_load: 10,

  /** Guidelines max chars (substring) */
  guidelines_max_chars: 600,
  guidelines_max_chars_audit: 500,
} as const;

// ── 4 BULLET STRUCTURE ────────────────────────────────────────

export const BULLET_CONFIG = {
  count: 5,
  versions: ["Detailed", "Concise", "Content", "KeyFeatures"] as const,

  /** Bullet purpose by position */
  purposes: {
    B1: "core value",
    B2: "fit / scope",
    B3: "workflow / instruction",
    B4: "care / durability",
    B5: "variation-specific for Child ASINs; compatibility / accessory pairing for Parent ASINs",
  },

  /** Buyer stage by bullet position */
  buyer_stages: {
    B1: "Consideration",
    B2: "Consideration",
    B3: "Decision",
    B4: "Decision",
    B5: "Decision",
  },

  /** Format: ALL CAPS header + colon, then normal case */
  format: "ALL CAPS SUMMARY: Normal case body text",

  rules: [
    "Detailed: MIN 2 keywords + 1 partial variation per bullet",
    "Concise: MIN 2 keywords per bullet",
    "Content: MIN 1 keyword per bullet",
    "Key Features: MIN 1 keyword per bullet",
    "Max 1x per keyword phrase per bullet",
    "No word repeated >2x per bullet (case-insensitive)",
    "No cross-bullet keyword duplication",
    "B5 must be variation-specific for Child ASINs",
    "Each bullet body: feature -> benefit -> practical use/value (P3)",
    "ALL CAPS header states concrete benefit, not generic label (P21)",
    "Vary lexical opener: no two bullets in same version share first 3-word phrase (P6)",
    "Balanced coverage across 5 bullets: features, benefits, use cases, value (P18)",
  ],
} as const;

// ── 5 TITLE RULES ─────────────────────────────────────────────

export const TITLE_CONFIG = {
  allowed_chars: "letters, numbers, spaces, hyphens only",
  allowed_chars_regex: /^[a-zA-Z0-9\s-]+$/,
  hyphen_rule: "One space before AND after each hyphen",
  structure: [
    "Segment 1 (REQUIRED): Brand Name + Core Product Noun phrase",
    "Segments 2-5 (in order, hyphen-separated): Key Feature(s), Material/Function, Use Case/Location, Size",
    "Total 1-4 segments — keep the whole title at or under 75 chars; brand + highest-priority keyword come first",
    "Variation attributes NEVER in segment 1",
    "Parent ASIN: Size='Parent' in data but do NOT put 'Parent' in title text",
  ],
  size_placements: ["end", "after-brand", "after-product"] as const,
  default_size_placement: "after-product" as const,
  keyword_rule: "All approved title keywords woven in naturally; highest-priority keyword in segment 1 (P21 front-load)",
  no_filler: true,
} as const;

// ── 6 DESCRIPTION RULES ───────────────────────────────────────

export const DESCRIPTION_CONFIG = {
  no_colons: true,
  style: "Human narrative, not templated",
  buyer_journey: "Awareness → Consideration",
  keyword_placement: "Natural, density secondary to readability",
  no_verbatim_copy: true,
} as const;

// ── 6b CONTENT VOICES ────────────────────────────────────────

export const CONTENT_VOICES = {
  premium: "Luxury brand voice — sophisticated, evocative, aspirational. Use rich sensory language.",
  conversational: "Friendly, approachable, relatable — like a trusted friend recommending a product they love.",
  technical: "Precise, specification-focused, data-driven — for informed buyers who research before purchasing.",
  natural: "Clean, clear, human — no marketing fluff, no keyword stuffing. Let the product speak for itself.",
} as const;

// ── 7 BACKEND SEARCH TERMS ───────────────────────────────────

export const BACKEND_CONFIG = {
  sets: ["Core", "Supplement", "Symptom", "Audience", "LongTail"] as const,
  format: "Lowercase, no punctuation, space-separated",
  /** Use ONLY T3 + T4 keywords (T1/T2 are in surface content) */
  allowed_tiers: ["T3", "T4"] as const,
  prohibited: [
    "Brand name",
    "Competitor names",
    "Prohibited/restricted terms",
  ],
  no_repetition_across_sets: true,
} as const;

// ── 8 COSMO RELATIONSHIP TYPES ───────────────────────────────

export const COSMO_RELATIONSHIP_TYPES = [
  // Functional/Usage
  "USED_FOR_FUNC",  // Core function or practical use of the product
  "USED_TO",        // Intended purpose or outcome the product supports
  "CAPABLE_OF",     // What the product can enable based on its features
  // Event/Context
  "USED_FOR_EVE",   // Events or activities where the product is used
  "USED_ON",        // Time-based, seasonal, or situational relevance
  "USED_IN_LOC",    // Physical locations or environments
  // Product/Concept
  "USED_AS",        // Functional or conceptual role of the product
  "IS_A",           // Primary taxonomic classification
  "xIS_A",          // Audience- or context-specific classifications
  // Body/Interaction
  "USED_IN_BODY",   // Body interaction (compliant, non-medical language only)
  // Complementary
  "USED_WITH",      // Products or items commonly used alongside
  // Audience/User
  "USED_FOR_AUD",   // Intended audience
  "USED_BY",        // Common user type or demographic
  // Interest/Motivation
  "xINTERESTED_IN", // Interests, preferences, or thematic categories tied to the user
  "xWANT",          // Goals, desires, or activities the user seeks to accomplish
] as const;

export const PDP_SECTIONS = [
  "Title",
  "Bullet 1",
  "Bullet 2",
  "Bullet 3",
  "Bullet 4",
  "Bullet 5",
  "Description",
  "Backend",
  "A+ Module",
  "Image",
  "Not Applicable",
] as const;

// ── 9 ALEXA FOR SHOPPING CATEGORIES ──────────────────────────────────────

export const RUFUS_QUESTION_CATEGORIES = [
  "Product Identity",
  "Usage & Application",
  "Customer Satisfaction",
  "Customer Dissatisfaction",
  "Competitive Landscape",
  "Purchase Decision",
  "Ingredient & Composition",
  "Efficacy & Performance",
  "Audience & Demographics",
  "Seasonal & Contextual",
] as const;

export const RUFUS_INSIGHT_TYPES = [
  "Core Benefit",
  "Objection",
  "Desire",
  "Usage Pattern",
  "Competitive Advantage",
  "Purchase Trigger",
  "Trust Signal",
  "Value Proposition",
] as const;

export const RUFUS_FIXED_QUESTIONS = [
  "What is this product for?",
  "What do people like about this product?",
  "What do people NOT like about this product?",
  "What are people buying instead of this product?",
  "Why do customers choose this product over alternatives?",
] as const;

export const RUFUS_PHASE2_FOCUS_AREAS = [
  "Usage patterns",
  "Objection resolution",
  "Competitive positioning",
  "Audience segments",
  "Purchase triggers",
  "Seasonal usage",
  "Gifting context",
  "Complementary products",
] as const;

// ── 10 REVIEW ANALYSIS ───────────────────────────────────────

export const REVIEW_SENTIMENT_TIERS = [
  "Positive+",
  "Positive",
  "Neutral",
  "Negative",
  "Negative-",
] as const;

export const REVIEW_USAGE_TYPES = [
  "Ritual",
  "Habitual",
  "Occasional",
  "Emergency",
] as const;

// ── 11 SEARCH INTENT & BUYER STAGES ──────────────────────────

export const SEARCH_INTENTS = [
  "Informational",
  "Commercial",
  "Navigational",
  "Transactional",
] as const;

export const BUYER_STAGES = [
  "Awareness",
  "Consideration",
  "Decision",
] as const;

export const MATCH_TYPES = [
  "Exact",
  "Phrase",
  "Broad",
] as const;

// ── 12 COMPLIANCE ─────────────────────────────────────────────

export const COMPLIANCE = {
  /** Words/phrases that trigger a CRITICAL compliance flag */
  restricted_words: [
    // ONE list for both sides: the generator is told to avoid exactly these, and the S6
    // compliance check flags exactly these (src/components/seo/phases/seo-phase.tsx).
    // Medical / disease claims
    "cure", "cures", "cured", "curing",
    "treat", "treats", "treating", "treatment", "treatments",
    "heal", "heals", "healing", "healed",
    "prevent", "prevents", "preventing", "prevention",
    "diagnose", "diagnoses", "diagnosis",
    "disease", "diseases", "disorder", "disorders",
    "symptom", "symptoms",
    "medical", "medicine", "drug", "drugs", "pharmaceutical", "prescription", "therapeutic",
    "cancer", "diabetes", "alzheimer", "autism", "anxiety disorder", "depression",
    "antibiotic", "antiviral", "antimicrobial",
    "clinically proven", "clinically tested", "clinically studied",
    "doctor recommended",
    "FDA", "FDA approved", "FDA-approved",
    // Guarantee / result claims
    "guarantee", "guaranteed", "guarantees", "100% guaranteed", "money back guarantee",
    "100% effective",
    "miracle",
    "instant results",
    "risk-free",
    // Superlatives / rankings
    "best", "#1", "number one", "number 1", "top rated", "award winning",
    // Promotional / transactional
    "free shipping", "in stock", "buy now", "add to cart", "sale", "discount", "% off",
    "click here", "visit our website", "see our website",
  ],

  /** Structural rules that apply globally */
  structural_rules: [
    "No colons in titles",
    "No colons in descriptions",
    "Colons ONLY allowed in bullet ALL CAPS headers",
    "No emoji or non-ASCII characters",
    "Hyphens require one space before AND after",
    "No word repeated >2x per element (case-insensitive)",
    "Max 1x per keyword phrase per element",
  ],

  /** Content quality rules */
  quality_rules: [
    "Content must read as human-written",
    "No keyword stuffing — quality over density",
    "Never copy existing content verbatim",
    "No filler phrases in titles",
    "No competitor names anywhere in content",
    "No brand name in backend search terms",
  ],

  /** Audit scoring categories */
  audit_categories: [
    "Compliance",
    "Keyword Coverage",
    "COSMO Density",
    "Alexa for Shopping Coverage",
    "Human Voice",
    "Buyer Journey",
    "Variation Consistency",
  ] as const,

  /** Buyer journey mapping for audit */
  buyer_journey_map: {
    title: "Decision",
    bullet_1: "Consideration",
    bullet_2: "Consideration",
    bullet_3: "Decision",
    bullet_4: "Decision",
    bullet_5: "Decision",
    description: "Awareness → Consideration",
  },
} as const;

// ── 13 SECTION HEADERS ───────────────────────────────────────
// For UI rendering: first word white (#FFFFFF), second word orange (#E97E05)

export const SECTION_HEADERS = [
  { id: 1, words: ["CHARACTER", "LIMITS"] },
  { id: 2, words: ["KEYWORD", "TIERS"] },
  { id: 3, words: ["PROCESSING", "LIMITS"] },
  { id: 4, words: ["BULLET", "STRUCTURE"] },
  { id: 5, words: ["TITLE", "RULES"] },
  { id: 6, words: ["DESCRIPTION", "RULES"] },
  { id: 7, words: ["BACKEND", "TERMS"] },
  { id: 8, words: ["COSMO", "RELATIONSHIPS"] },
  { id: 9, words: ["ALEXA FOR SHOPPING", "CATEGORIES"] },
  { id: 10, words: ["REVIEW", "ANALYSIS"] },
  { id: 11, words: ["SEARCH", "INTENTS"] },
  { id: 12, words: ["COMPLIANCE", "RULES"] },
  { id: 13, words: ["VALIDATION", "HELPERS"] },
] as const;

export const HEADER_COLORS = {
  first: "#FFFFFF",
  second: "#E97E05",
} as const;

// ── 14 PROMPT GENERATION ─────────────────────────────────────
// Generates the text block injected into every Claude system prompt

/**
 * Returns the full config as a structured prompt block.
 * Inject this at the top of every Claude system prompt.
 */
export function buildConfigPromptBlock(): string {
  const lines: string[] = [];

  lines.push("=== 1o8 SEO PIPELINE — AUTHORITATIVE RULES ===");
  lines.push("");

  // Character limits
  lines.push("## CHARACTER & BYTE LIMITS (STRICT — NEVER EXCEED)");
  for (const [field, limit] of Object.entries(CHAR_LIMITS)) {
    const label = field.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    lines.push(`- ${label}: ${limit.min}-${limit.max} ${limit.unit}`);
  }
  lines.push("");

  // Keyword tiers
  lines.push("## KEYWORD TIER DISTRIBUTION");
  for (const [tier, cfg] of Object.entries(KEYWORD_TIERS)) {
    const max = cfg.maxCount === Infinity ? "unlimited" : String(cfg.maxCount);
    lines.push(`- ${tier} (${cfg.label}): ${cfg.minCount}-${max} keywords → ${cfg.primaryLocation}, ${cfg.matchType} match`);
  }
  lines.push("");
  lines.push("## TIER → CONTENT SECTION MAPPING");
  for (const [section, tiers] of Object.entries(TIER_TO_SECTION)) {
    lines.push(`- ${section}: ${tiers.join(", ")}`);
  }
  lines.push("");

  // Bullet structure
  lines.push("## BULLET STRUCTURE");
  lines.push(`- ${BULLET_CONFIG.count} bullets × ${BULLET_CONFIG.versions.length} versions (${BULLET_CONFIG.versions.join(", ")})`);
  lines.push(`- Format: ${BULLET_CONFIG.format}`);
  for (const [bullet, purpose] of Object.entries(BULLET_CONFIG.purposes)) {
    const stage = BULLET_CONFIG.buyer_stages[bullet as keyof typeof BULLET_CONFIG.buyer_stages];
    lines.push(`  - ${bullet}: ${purpose} [${stage}]`);
  }
  for (const rule of BULLET_CONFIG.rules) {
    lines.push(`  - RULE: ${rule}`);
  }
  lines.push("");

  // Title rules
  lines.push("## TITLE RULES");
  lines.push(`- Allowed: ${TITLE_CONFIG.allowed_chars}`);
  lines.push(`- Hyphen: ${TITLE_CONFIG.hyphen_rule}`);
  for (const rule of TITLE_CONFIG.structure) {
    lines.push(`- ${rule}`);
  }
  lines.push(`- Keywords: ${TITLE_CONFIG.keyword_rule}`);
  lines.push("- No filler phrases");
  lines.push("");

  // Description rules
  lines.push("## DESCRIPTION RULES");
  lines.push("- NO colons allowed");
  lines.push(`- Style: ${DESCRIPTION_CONFIG.style}`);
  lines.push(`- Buyer journey: ${DESCRIPTION_CONFIG.buyer_journey}`);
  lines.push(`- Keywords: ${DESCRIPTION_CONFIG.keyword_placement}`);
  lines.push("- Never copy existing content verbatim");
  lines.push("");

  // Backend rules
  lines.push("## BACKEND SEARCH TERMS");
  lines.push(`- Sets: ${BACKEND_CONFIG.sets.join(", ")}`);
  lines.push(`- Format: ${BACKEND_CONFIG.format}`);
  lines.push(`- Allowed tiers: ${BACKEND_CONFIG.allowed_tiers.join(", ")} ONLY`);
  for (const p of BACKEND_CONFIG.prohibited) {
    lines.push(`- PROHIBITED: ${p}`);
  }
  lines.push("- No repetition across sets");
  lines.push("");

  // COSMO
  lines.push("## COSMO RELATIONSHIPS");
  lines.push(`- Exactly ${PROCESSING_LIMITS.cosmo_rows} rows required`);
  lines.push(`- Types: ${COSMO_RELATIONSHIP_TYPES.join(", ")}`);
  lines.push(`- PDP sections: ${PDP_SECTIONS.join(", ")}`);
  lines.push(`- Usage explanation: max ${PROCESSING_LIMITS.cosmo_usage_max_words} words`);
  lines.push(`- Notes: max ${PROCESSING_LIMITS.cosmo_notes_max_words} words`);
  lines.push("- Every row must trace to a keyword, review insight, or Alexa for Shopping answer");
  lines.push("- NEVER include competitor names");
  lines.push("- No blank fields — use 'Not Applicable' where needed");
  lines.push("");

  // Compliance
  lines.push("## COMPLIANCE — NEVER VIOLATE");
  lines.push("### Restricted words/phrases (triggers CRITICAL flag):");
  lines.push(COMPLIANCE.restricted_words.map(w => `"${w}"`).join(", "));
  lines.push("");
  lines.push("### Structural rules:");
  for (const rule of COMPLIANCE.structural_rules) {
    lines.push(`- ${rule}`);
  }
  lines.push("");
  lines.push("### Quality rules:");
  for (const rule of COMPLIANCE.quality_rules) {
    lines.push(`- ${rule}`);
  }
  lines.push("");

  // Buyer journey
  lines.push("## BUYER JOURNEY MAP");
  for (const [section, stage] of Object.entries(COMPLIANCE.buyer_journey_map)) {
    lines.push(`- ${section.replace(/_/g, " ")}: ${stage}`);
  }
  lines.push("");

  lines.push("=== END PIPELINE RULES ===");

  return lines.join("\n");
}

// ── 15 VALIDATION HELPERS ────────────────────────────────────

/** Check if a string is within character limits for a given field */
export function validateCharLimit(
  value: string,
  field: keyof typeof CHAR_LIMITS
): { valid: boolean; length: number; min: number; max: number; unit: string } {
  const limit = CHAR_LIMITS[field];
  const length = limit.unit === "bytes"
    ? new TextEncoder().encode(value).length
    : value.length;
  return {
    valid: length >= limit.min && length <= limit.max,
    length,
    min: limit.min,
    max: limit.max,
    unit: limit.unit,
  };
}

/** Check a string against restricted words list */
export function findRestrictedWords(text: string): string[] {
  const lower = text.toLowerCase();
  // Whole-word match, same as the S6 compliance check ("best" must not flag "bestseller")
  return COMPLIANCE.restricted_words.filter(word => {
    const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(lower);
  });
}

/** Validate title characters */
export function validateTitleChars(title: string): { valid: boolean; invalid_chars: string[] } {
  const invalid: string[] = [];
  for (const char of title) {
    if (!TITLE_CONFIG.allowed_chars_regex.test(char) && !invalid.includes(char)) {
      invalid.push(char);
    }
  }
  return { valid: invalid.length === 0, invalid_chars: invalid };
}

/** Check for word repetition (>2x per element) */
export function findRepeatedWords(text: string, maxRepetitions = 2): string[] {
  const words = text.toLowerCase().match(/\b\w+\b/g) ?? [];
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > maxRepetitions)
    .map(([word]) => word);
}

/** Check if colons are used correctly (only in bullet headers) */
export function validateColonUsage(
  text: string,
  fieldType: "title" | "description" | "bullet"
): { valid: boolean; message?: string } {
  const hasColon = text.includes(":");
  if (fieldType === "title" && hasColon) {
    return { valid: false, message: "Colons not allowed in titles" };
  }
  if (fieldType === "description" && hasColon) {
    return { valid: false, message: "Colons not allowed in descriptions" };
  }
  if (fieldType === "bullet" && hasColon) {
    // Colon should only appear once, after the ALL CAPS header
    const colonIndex = text.indexOf(":");
    const header = text.slice(0, colonIndex);
    if (header !== header.toUpperCase()) {
      return { valid: false, message: "Colon must follow ALL CAPS header" };
    }
    // Only one colon allowed
    if ((text.match(/:/g) ?? []).length > 1) {
      return { valid: false, message: "Only one colon allowed per bullet (after header)" };
    }
  }
  return { valid: true };
}
