/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-flatmap-filter */
import { NextRequest, NextResponse } from "next/server";
import { getConfigDocBlock } from "@/lib/seo-config-doc";
import { getAuthSession } from "@/lib/auth-db";
import { logEvent } from "@/lib/event-logger";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { CONTENT_VOICES, CHAR_LIMITS } from "@/lib/seo-pipeline-config";
import { db } from "@/lib/db";
import { master, varietyPackItems } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { loadCompetitiveData } from "@/lib/seo-skill-runner";
import { checkRateLimit } from "@/lib/rate-limit";
import { coherenceRows, HumanScore, HumanScoreDetractor, HumanScorePath } from "@/lib/seo/coherence";
import { computeHumanScore } from "@/lib/seo/human-score-rules";
import { getProjectSqp, buildTitleKeywordBlock, type ProjectSqp } from "@/lib/seo/sqp";
import {
  distributeKeywords,
  computeLeftoverKeywords,
} from "@/lib/seo/keyword-distribution";

export type { HumanScore, HumanScoreDetractor, HumanScorePath };

export const maxDuration = 300;

/** Filter COSMO rows by PDP section for targeted prompt injection */
function filterCosmoForSection(cosmo: any[], section: string): any[] {
  return cosmo.filter((c: any) =>
    c.COSMOAppliedPDPSection1 === section || c.COSMOAppliedPDPSection2 === section
  );
}

/** Format COSMO rows with PDP context for prompts */
function formatCosmoBlock(cosmo: any[], label: string): string {
  if (!cosmo.length) return "";
  return `\n${label}:\n${cosmo.map((c: any) =>
    `- ${c.COSMORelationType}: ${c.COSMOMappedValue} → ${c.COSMOUsageExplanation || ""}`
  ).join("\n")}`;
}

/**
 * Extract structured product attributes from a HubASIN object for grounding.
 * Combines productAttributes-sourced fields (always present) with rawColumnValues
 * dimension/material data (available on projects path; absent on intake path — handled gracefully).
 */
function extractStructuredFacts(a: any): Record<string, string> {
  const result: Record<string, string> = {};
  const raw: Record<string, string> = a.rawColumnValues || {};
  const pick = (...keys: string[]): string | undefined =>
    keys.map((k) => raw[k]).find((v) => typeof v === "string" && v.trim() !== "");

  // productAttributes-sourced fields — available from both bq/asins and projects paths
  const sf = [a.SpecialFeatures1, a.SpecialFeatures2, a.SpecialFeatures3, a.SpecialFeatures4, a.SpecialFeatures5].filter((v): v is string => typeof v === "string" && v !== "");
  if (sf.length) result.SpecialFeatures = sf.join("; ");

  const pb = [a.ProductBenefits1, a.ProductBenefits2, a.ProductBenefits3, a.ProductBenefits4, a.ProductBenefits5].filter((v): v is string => typeof v === "string" && v !== "");
  if (pb.length) result.ProductBenefits = pb.join("; ");

  const ru = [a.RecommendedUsesForProduct1, a.RecommendedUsesForProduct2, a.RecommendedUsesForProduct3].filter((v): v is string => typeof v === "string" && v !== "");
  if (ru.length) result.RecommendedUses = ru.join("; ");

  const su = [a.SpecificUsesforProduct1, a.SpecificUsesforProduct2, a.SpecificUsesforProduct3].filter((v): v is string => typeof v === "string" && v !== "");
  if (su.length) result.SpecificUses = su.join("; ");

  if (a.UnitCount) result.UnitCount = `${a.UnitCount}${a.UnitCountType ? ` ${a.UnitCountType}` : ""}`;
  if (a.FormFactor) result.FormFactor = a.FormFactor;

  // rawColumnValues-sourced fields — available on projects path only; absent on intake path
  const h = pick("item_height", "ItemHeight");
  const l = pick("item_length", "ItemLength");
  const w = pick("item_width", "ItemWidth");
  const wt = pick("item_weight", "ItemWeight");
  const dimParts = [h && `H: ${h}`, l && `L: ${l}`, w && `W: ${w}`, wt && `Weight: ${wt}`].filter(Boolean);
  if (dimParts.length) {
    result.ItemDimensions = dimParts.join(", ");
  } else {
    const combined = pick("ItemDimensions", "item_dimensions", "PackageDimensions");
    if (combined) result.ItemDimensions = combined;
  }

  const mat = pick("MaterialType", "material_type", "MaterialComposition", "Fabric", "fabric_type", "MaterialMade");
  if (mat) result.MaterialType = mat;

  // Mechanism — check rawColumnValues mechanism key AND raw SpecialFeature slots (Amazon key, not productAttributes key)
  const mechanism = pick("ActivationMechanism", "SpecialFeature1", "SpecialFeature2", "SpecialFeature3");
  if (mechanism) result.Mechanism = mechanism;

  return result;
}

/**
 * Builds the SOURCE FACTS block — the model's grounding ground truth.
 * Structure:
 *   ## SOURCE FACTS & GUIDELINES (resolved cascade: listing → group → variation → brand)
 *   1. Brand guidelines (free-text)
 *   2. Resolved typed guidelines with tier annotations (already rendered by caller)
 *   3. LIVE LISTING for each ASIN — title, bullets, description, generic keywords
 */
function buildSourceFactsBlock(
  brandGuidelinesText: string | undefined,
  resolvedGuidelinesText: string | undefined,
  asinList: Array<{
    asin: string;
    existing_title: string;
    existing_bullets: string[];
    existing_description: string;
    existing_generic_keywords: string[];
    structured_facts: Record<string, string>;
  }>,
): string {
  const parts: string[] = ["\n## SOURCE FACTS & GUIDELINES — TREAT AS FACTUAL GROUND TRUTH"];
  parts.push("Order of precedence per field: listing > group > variation > brand. Free-text brand guidelines apply to fields not covered by typed tiers.\n");

  if (brandGuidelinesText && brandGuidelinesText.trim()) {
    parts.push(`### Brand guidelines [tier: brand]\n${brandGuidelinesText.trim()}\n`);
  }
  if (resolvedGuidelinesText && resolvedGuidelinesText.trim()) {
    parts.push(`### Resolved typed guidelines\n${resolvedGuidelinesText.trim()}\n`);
  }

  const liveBlocks = asinList
    .map((a) => {
      const lines: string[] = [`#### ASIN ${a.asin} — current live listing`];
      if (a.existing_title) lines.push(`Live title: ${a.existing_title}`);
      if (a.existing_bullets.length) {
        lines.push("Live bullets:");
        a.existing_bullets.forEach((b, i) => lines.push(`  ${i + 1}. ${b}`));
      }
      if (a.existing_description) lines.push(`Live description: ${a.existing_description}`);
      if (a.existing_generic_keywords.length) lines.push(`Live generic keywords: ${a.existing_generic_keywords.join(", ")}`);
      if (Object.keys(a.structured_facts).length) {
        lines.push("Structured product attributes (from manufacturer catalog data):");
        Object.entries(a.structured_facts).forEach(([k, v]) => lines.push(`  ${k}: ${v}`));
      }
      return lines.length > 1 ? lines.join("\n") : "";
    })
    .filter(Boolean)
    .join("\n\n");
  if (liveBlocks) {
    parts.push(`### LIVE LISTINGS — concrete facts from current Amazon listings (use these to verify dimensions, materials, mechanisms, capabilities)\n${liveBlocks}\n`);
  }

  return parts.join("\n");
}

/** Build content voice instruction */
function getVoiceInstruction(voice?: string): string {
  const v = (voice && voice in CONTENT_VOICES)
    ? CONTENT_VOICES[voice as keyof typeof CONTENT_VOICES]
    : CONTENT_VOICES.natural;
  return `\nCONTENT VOICE: ${v}`;
}

/** Native American English voice contract — injected into titles and bullets system prompts */
const NATIVE_VOICE_CONTRACT = `
VOICE & WRITING STANDARD (NON-NEGOTIABLE):

You are a senior American consumer brand copywriter — not an SEO technician. You write the way a native American speaker thinks: direct, benefit-led, natural rhythm.

WRITING PRINCIPLES:
1. Lead with the benefit, not the feature — "Stays put all day" not "Features enhanced adhesive technology"
2. Use contractions where natural — "doesn't", "you'll", "it's", "won't", "can't"
3. Vary sentence rhythm — mix short punchy statements with longer explanatory ones; never write four long sentences in a row
4. American idiom over formal register — "works great for" not "is well-suited to facilitate"; "easy to use" not "demonstrates ease of utilization"
5. Every sentence must earn its place — if it only strings keywords together with no real meaning, rewrite it
6. Concrete over abstract — replace vague claims with specific ones: "holds 200 lbs" not "exceptional strength"; "fits 32–36 inch waist" not "versatile fit"; "ready in 60 seconds" not "quick setup"
7. Parallel structure in bullets — all 5 DetailedBulletPoints for a given ASIN must open grammatically the same way (e.g., all start with an imperative clause, or all start with a result phrase); mixing patterns signals machine assembly

NEVER WRITE (non-native, robotic patterns):
- "Facilitates the enhancement of..." → write "helps you..."
- "Demonstrates suitability for utilization across..." → write "works great for..."
- "Provides to users the benefit of..." → write "gives you..."
- "Is well-suited to meet the needs of..." → write "perfect for..."
- "This product features advanced..." → write "Built with..." or "You get..."
- "This [product] is..." / "This [product] helps..." / "This [product] provides..." after an ALL CAPS header → write "Our [product] is..." / "Our [product] helps..." / "Our [product] provides...". Example: "JOINT SUPPORT: This Arm Sleeve keeps your joints warm" → "JOINT SUPPORT: Our Arm Sleeve keeps your joints warm". Applies to every sentence in bullets and descriptions — never start a sentence body with "This [product name]".
- Pure keyword lists disguised as sentences: "Premium organic turmeric curcumin supplement capsules black pepper bioperine joint support" is NOT a sentence
- Meaningless intensifiers: "very durable" → "holds 200 lbs"; "incredibly easy" → "ready in 30 seconds"; never use: very, really, quite, extremely, incredibly, amazing, revolutionary, game-changing, next-level, cutting-edge, state-of-the-art
- Redundant pleonasms: "free gift" → "gift"; "completely unique" → "unique"; "new innovation" → "innovation"; "added bonus" → "bonus"; "end result" → "result"

PUNCTUATION RULE: Hyphenate compound modifiers before nouns — "heavy-duty grip" not "heavy duty grip"; "easy-to-clean surface" not "easy to clean surface"; "long-lasting hold" not "long lasting hold".

CALIBRATION EXAMPLES:

Title — keyword dump → descriptive narrative:
❌ "Premium Organic Turmeric Curcumin Supplement Capsules Black Pepper BioPerine Joint Support Inflammation Relief Non-GMO"
✅ "Premium Turmeric Curcumin with BioPerine - Supports Joint Comfort and Healthy Inflammation Response for Active Adults - 120 Capsules"

Detailed bullet — feature list → benefit story:
❌ "SUPERIOR ABSORPTION: Formulated with advanced bioavailability enhancement technology utilizing black pepper extract for maximum nutrient uptake and absorption optimization"
✅ "ABSORBS UP TO 20X BETTER: Black pepper BioPerine dramatically boosts how much turmeric your body actually uses — so you get the full benefit of every capsule, not just what passes through"

Detailed bullet — stiff/formal → natural/conversational:
❌ "VERSATILE APPLICATION: This product demonstrates suitability for utilization across multiple contexts and environments including indoor and outdoor recreational activities"
✅ "READY FOR ANYTHING: Whether you're hiking, at the gym, or running errands, these hold up all day without slipping, bunching, or leaving marks"
`.trim();

/**
 * Anti-AI writing contract — injected into all Pass 1 system prompts.
 * Distilled from Wikipedia "Signs of AI writing" (WikiProject AI Cleanup).
 * Goal: prevent AI-detectable patterns at generation time, not just in post-passes.
 */
const ANTI_AI_PATTERNS = `
ANTI-AI WRITING RULES (NON-NEGOTIABLE — apply before writing a single word):

You are not an AI assistant producing output. You are a human copywriter who happens to be fast. Read these rules before generating anything — they describe patterns you must never produce.

BANNED WORDS & PHRASES (Wikipedia AI writing signals — delete on sight):
- Significance inflation: testament, pivotal, vital role, groundbreaking, marks a shift, evolving landscape, underscores, highlights its importance, setting the stage for, indelible mark, deeply rooted, enduring, stands as, serves as, represents a
- Promotional fluff: boasts, vibrant, rich (figurative), profound, breathtaking, must-visit, stunning, nestled, in the heart of, renowned, showcasing, exemplifies, commitment to
- AI vocabulary: delve, tapestry, intricate/intricacies, interplay, landscape (abstract), cultivate, foster, garner, underscore, align with, crucial, pivotal, key (adjective overuse), valuable
- Copula avoidance: never write "serves as X" / "stands as X" / "represents X" when you mean "is X". Write "is" or "are" or "has".
- Filler hedging: "It is important to note that", "It could potentially be argued", "In order to achieve", "Due to the fact that", "At this point in time", "has the ability to" → cut these entirely or rewrite directly
- Persuasive authority tropes: "The real question is", "At its core", "what really matters", "fundamentally", "the heart of the matter", "in reality" — these add ceremony to ordinary points, skip them
- Signposting announcements: "Let's dive in", "Here's what you need to know", "Let's explore", "Without further ado" — do not announce what you are about to do, just do it

STRUCTURAL PATTERNS TO AVOID:
- Rule of three forcing: do not force every idea into groups of exactly three. Two items or four items are fine.
- Negative parallelism: avoid "It's not just about X, it's about Y" or "Not merely A, it's B" constructions
- -ing phrase padding: do not tack present-participle phrases onto sentence ends to fake depth. "Supports healthy joints, reflecting the brand's commitment to wellness" — the -ing clause is empty, cut it
- Elegant variation / synonym cycling: if the product is a "sleeve", call it a "sleeve" throughout. Do not rotate "sleeve" → "garment" → "accessory" → "product" to avoid repetition
- Generic positive conclusion: never close with "the future looks bright", "exciting times ahead", or any variant. End on a specific fact or claim
- False ranges: avoid "from X to Y, from A to B" structures where X and Y are not on a meaningful scale
- Em dash overuse: use a comma, period, or parentheses instead of — in most cases. One em dash per bullet maximum

SENTENCE-LEVEL RULES:
- Use simple "is/are/has/does" where correct — never dress up a simple statement with "serves as" or "functions as"
- Vary sentence length deliberately: mix short (4–8 words) and medium (12–20 words). Never write three long sentences in a row
- Use active voice with a named subject: "The silicone grip holds 200 lbs" not "200 lbs is supported by the silicone grip"
- Passive constructions with no actor are banned: "No configuration needed" → "You don't need to configure anything"; "Results are preserved automatically" → "The system saves your results automatically"
- Be specific. "Exceptional quality" means nothing. "Rated for 500 wash cycles" means something.
`.trim();

/** Extract current content for a batch from currentRows for revision-mode preservation. */
function getCurrentBatchContent(batch: string, currentRows: any[] | undefined): string {
  const rows = currentRows || [];
  if (!rows.length) return "";
  if (batch === "titles") {
    return rows
      .filter((r: any) => r?.Title)
      .map((r: any) => `--- ${r.ASIN} ---\n${r.Title}`)
      .join("\n\n");
  }
  if (batch === "description") {
    return rows
      .filter((r: any) => r?.ProductDescription)
      .map((r: any) => `--- ${r.ASIN} ---\n${r.ProductDescription}`)
      .join("\n\n");
  }
  if (batch === "backend") {
    return rows
      .filter((r: any) => r?.BackendSearchTerms)
      .map((r: any) => `--- ${r.ASIN} ---\n${r.BackendSearchTerms}`)
      .join("\n\n");
  }
  if (batch === "bullets") {
    const cols: string[] = [];
    for (const pfx of ["DetailedBulletPoint"]) {
      for (let i = 1; i <= 5; i++) cols.push(`${pfx}_${i}`);
    }
    return rows
      .map((r: any) => {
        const lines = cols.filter((c) => r?.[c]).map((c) => `  ${c}: ${r[c]}`);
        if (!lines.length) return "";
        return `--- ${r.ASIN} ---\n${lines.join("\n")}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }
  return "";
}

/**
 * Build the revision instruction block prepended to each batch's user prompt.
 * When the user submits feedback (e.g. "ADD keywords X, Y, Z" or "REMOVE keywords A, B"),
 * Claude must REVISE existing content rather than regenerate from scratch — otherwise
 * keywords already in the content silently disappear.
 *
 * `usedKeywords` is the list of keyword phrases currently present in the content
 * (computed client-side via findUsedKeywords). They become a MUST-KEEP list so Claude
 * cannot silently swap "elastic knee support" for "elastic knee sleeve" or similar.
 *
 * For backend search terms the 500-byte cap is hard, so the must-keep list is softened
 * to "keep as many as fit, prioritizing tier order".
 */
function buildRevisionBlock(
  feedback: string | undefined,
  contentLabel: string,
  currentContent: string,
  mustKeepKeywords: string[] = [],
  isHardByteCap = false,
): string {
  if (!feedback) return "";
  const currentBlock = currentContent
    ? `\nCURRENT ${contentLabel} (revise THESE — do not rewrite from scratch):\n${currentContent}\n`
    : "";
  const keepList = (mustKeepKeywords || []).filter(Boolean);
  let keepBlock = "";
  if (keepList.length) {
    keepBlock = isHardByteCap
      ? `\nMUST-KEEP KEYWORDS (currently present — keep as many as possible while staying within the 249-byte cap; if you must drop some to fit, drop lowest-tier first; UNLESS the revision instruction explicitly REMOVEs them):\n${keepList.map((k) => `- ${k}`).join("\n")}\n`
      : `\nMUST-KEEP KEYWORDS (currently present in the content — every one of these phrases MUST appear verbatim in the regenerated ${contentLabel.toLowerCase()} in at least one ASIN's output, UNLESS the revision instruction explicitly REMOVEs them; do NOT substitute similar phrases):\n${keepList.map((k) => `- ${k}`).join("\n")}\n`;
  }
  return `⚠️ CRITICAL REVISION INSTRUCTION (HIGHEST PRIORITY — OVERRIDE ALL DEFAULTS):
${feedback}

PRESERVATION RULE — read carefully: This is a REVISION of existing content, NOT a fresh generation. The ${contentLabel.toLowerCase()} below already exist. Keep every keyword, claim, fact, and structural element from CURRENT ${contentLabel} intact. Apply ONLY the changes the revision instruction explicitly asks for:
- "ADD keywords X, Y, Z" → weave the new keywords into the existing content while keeping ALL existing keywords and the existing narrative.
- "REMOVE keywords X, Y, Z" → drop ONLY those exact terms; keep everything else.
- Do NOT rephrase, restructure, or rewrite anything the instruction did not target.
- Do NOT drop existing keywords that the instruction did not explicitly mark for removal.
- Do NOT substitute a keyword for a similar-but-different phrase (e.g. "elastic knee support" must NOT become "elastic knee sleeve").
${keepBlock}${currentBlock}
`;
}

/** Fields to extract per batch for the humanization pass */
const HUMANIZE_FIELDS: Record<"titles" | "bullets", string[]> = {
  titles: ["Title"],
  bullets: [
    "DetailedBulletPoint_1", "DetailedBulletPoint_2", "DetailedBulletPoint_3", "DetailedBulletPoint_4", "DetailedBulletPoint_5",
  ],
};

const HUMANIZE_CHAR_LIMITS: Record<"titles" | "bullets", string> = {
  titles: "Titles: 75 characters maximum.",
  bullets: "Bullets: 180-200 characters each, never more than 200.",
};

/**
 * Post-generation voice polish pass for titles and bullets.
 * Fixes stiff/non-native phrasing without touching keywords, structure, or character limits.
 * Returns original rows on any failure — never blocks the caller.
 */
async function humanizeRows(
  batch: "titles" | "bullets",
  rows: any[],
  mustKeepKeywords: string[],
  apiKey: string,
  model: string,
  maxTokens: number,
): Promise<any[]> {
  const fields = HUMANIZE_FIELDS[batch];

  const systemPrompt = `You are a native American English voice editor. Your only job is to fix tone and phrasing so the content sounds like a senior copywriter at a premium US consumer brand wrote it — not an AI or SEO tool.

FIX (voice & tone only):
- Stiff or formal phrasing, non-native sentence structure
- Hollow keyword-only sentences (add real meaning)
- Over-long words where shorter ones work naturally
- Missing contractions where a native speaker would use them (doesn't, you'll, it's, won't)
- Feature-led sentences — rewrite as benefit-led ("Features enhanced grip" → "Holds tight all day")
- Sentences that start with "This [product]..." after an ALL CAPS header — change to "Our [product]..." (e.g. "This Arm Sleeve protects..." → "Our Arm Sleeve protects...")

DO NOT change: CMOS grammar/style (intensifiers, pleonasms, hyphens, parallel structure) — those are handled in a separate CMOS pass.
DO NOT CHANGE: keywords (verbatim), JSON field names, ASIN values, ALL CAPS bullet headers before the colon.
DO NOT EXCEED character limits: ${HUMANIZE_CHAR_LIMITS[batch]}

Return ONLY a valid JSON array with the exact same structure as the input.`;

  const keepBlock = mustKeepKeywords.length > 0
    ? `MUST-KEEP KEYWORDS (every phrase must appear verbatim in at least one field — do NOT drop or substitute):\n${mustKeepKeywords.map((k) => `- ${k}`).join("\n")}\n\n`
    : "";

  const content = rows.map((r: any) => {
    const obj: Record<string, string> = { ASIN: r.ASIN };
    for (const f of fields) {
      if (r[f]) obj[f] = r[f];
    }
    return obj;
  });

  const userPrompt = `${keepBlock}Rewrite the following ${batch} for premium American English voice:\n\n${JSON.stringify(content, null, 1)}\n\nReturn ONLY valid JSON array.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 8192),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) return rows;

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const arrStart = cleaned.indexOf("[");
    if (arrStart === -1) return rows;
    let depth = 0, arrEnd = -1, inStr = false, esc = false;
    for (let i = arrStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { arrEnd = i; break; } }
    }
    if (arrEnd === -1) return rows;

    const humanized: any[] = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(humanized) || humanized.length !== rows.length) return rows;

    return rows.map((orig: any, i: number) => {
      const hu = humanized[i];
      if (!hu) return orig;
      const merged = { ...orig };
      for (const f of fields) {
        if (hu[f]) merged[f] = hu[f];
      }
      return merged;
    });
  } catch {
    return rows;
  }
}

/**
 * Chicago Manual of Style (18th ed.) editorial pass for titles and bullets.
 * Applies grammar/style rules only — does not touch voice or tone.
 * Runs after humanizeRows(). Falls back to original rows on any failure.
 *
 * Rules applied:
 *   §5.225  — Remove meaningless intensifiers; replace with specific claims
 *   §5.195  — Remove redundant pleonasms (free gift, completely unique, etc.)
 *   §7.85   — Hyphenate compound modifiers before nouns
 *   §5.249-252 — Enforce parallel grammatical structure within each ASIN's bullet series
 *   §5.254  — Replace vague abstract claims with concrete specific ones
 */
async function cmosRows(
  batch: "titles" | "bullets",
  rows: any[],
  mustKeepKeywords: string[],
  apiKey: string,
  model: string,
  maxTokens: number,
): Promise<any[]> {
  const fields = HUMANIZE_FIELDS[batch];

  const systemPrompt = `You are a Chicago Manual of Style (18th edition) copy editor. Your only job is to apply CMOS grammar and style rules to Amazon listing content. Do NOT change voice, tone, or narrative style — a separate voice editor already handled that.

APPLY THESE CMOS RULES ONLY:

§5.225 — Intensifiers: Remove meaningless intensifiers and replace with specific factual claims.
  Remove: very, really, quite, extremely, incredibly, amazing, revolutionary, game-changing, next-level, cutting-edge, state-of-the-art, powerful, exceptional, superior, ultimate
  Replace with the specific claim the intensifier is trying to convey:
  "very durable" → "holds 200 lbs" | "incredibly easy" → "ready in 30 seconds" | "amazing results" → state the actual result

§5.195 — Pleonasms: Remove redundant word pairs where one word already implies the other.
  free gift → gift | completely unique → unique | new innovation → innovation
  added bonus → bonus | end result → result | past history → history
  future plans → plans | true fact → fact | close proximity → proximity

§7.85 — Compound modifiers: Hyphenate compound modifiers that appear before a noun.
  heavy duty grip → heavy-duty grip | easy to clean surface → easy-to-clean surface
  long lasting hold → long-lasting hold | fast acting formula → fast-acting formula
  water resistant coating → water-resistant coating | non stick surface → non-stick surface

§5.249-252 — Parallel structure: Within each ASIN's DetailedBulletPoint series (B1-B5), all 5 bullets must open with the same grammatical pattern. If B1 starts with an imperative clause, B2-B5 must too. If B1 starts with a result phrase, all must. Do NOT mix patterns within one ASIN.

§5.254 — Concrete over abstract: Replace vague superlatives and abstract claims with specific, verifiable ones wherever the specific information can be inferred from context.
  "exceptional quality" → describe what makes it exceptional | "premium materials" → name the material if known
  "best-in-class performance" → state the performance metric

DO NOT CHANGE: keywords (verbatim), JSON field names, ASIN values, ALL CAPS bullet headers before the colon, voice/tone, narrative structure.
DO NOT EXCEED character limits: ${HUMANIZE_CHAR_LIMITS[batch]}

Return ONLY a valid JSON array with the exact same structure as the input.`;

  const keepBlock = mustKeepKeywords.length > 0
    ? `MUST-KEEP KEYWORDS (every phrase must appear verbatim — do NOT drop or substitute):\n${mustKeepKeywords.map((k) => `- ${k}`).join("\n")}\n\n`
    : "";

  const content = rows.map((r: any) => {
    const obj: Record<string, string> = { ASIN: r.ASIN };
    for (const f of fields) {
      if (r[f]) obj[f] = r[f];
    }
    return obj;
  });

  const userPrompt = `${keepBlock}Apply CMOS editorial rules to the following ${batch}:\n\n${JSON.stringify(content, null, 1)}\n\nReturn ONLY valid JSON array.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 8192),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) return rows;

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const arrStart = cleaned.indexOf("[");
    if (arrStart === -1) return rows;
    let depth = 0, arrEnd = -1, inStr = false, esc = false;
    for (let i = arrStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { arrEnd = i; break; } }
    }
    if (arrEnd === -1) return rows;

    const edited: any[] = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(edited) || edited.length !== rows.length) return rows;

    return rows.map((orig: any, i: number) => {
      const ed = edited[i];
      if (!ed) return orig;
      const merged = { ...orig };
      for (const f of fields) {
        if (ed[f]) merged[f] = ed[f];
      }
      return merged;
    });
  } catch {
    return rows;
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const startTime = Date.now();

  // Rate limit: 10 requests per minute per user
  const rlKey = session?.user?.email || req.headers.get("x-forwarded-for") || "anonymous";
  const rl = checkRateLimit(rlKey, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const body = await req.json();
  const { batch, brandName, asins, keywords, cosmo, rufus, reviews, guidelines, variationGuidelinesText, sizePlacement, currentRows, feedback, usedKeywords, contentVoice, projectId } = body;


  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  const aiConfig = await getAiFeatureConfig("seo_content");
  if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

  const distributed = distributeKeywords(keywords);
  const titleKws = distributed.title.slice(0, 8);
  // SQP-driven title keywords (falls back to Helium 10 when unavailable)
  let projectSqp: ProjectSqp = { available: false, reason: "no-account-mapping" };
  if (projectId && batch === "titles") {
    try {
      projectSqp = await getProjectSqp(projectId);
    } catch (err) {
      console.warn(`[seo/sqp] titles batch getProjectSqp failed for project ${projectId}; falling back to Helium 10.`, err);
      projectSqp = { available: false, reason: "redshift-error" };
    }
  }
  const titleKeywordBlock = buildTitleKeywordBlock(projectSqp, titleKws);
  const bulletKws = distributed.bullets.slice(0, 20);
  const descKws = distributed.description.slice(0, 20);
  const backendKws = distributed.backend.slice(0, 60);

  const asinList = asins.map((a: any) => ({
    asin: a.asin, parentage_level: a.parentage_level, variation_product: a.variation_product,
    variation_theme_name: a.variation_theme_name, flavor: a.flavor, style: a.style,
    color: a.color, size: a.size,
    existing_title: a.existing_content?.item_name || "",
    existing_bullets: Array.isArray(a.existing_content?.detailed_bullets)
      ? a.existing_content.detailed_bullets.filter(Boolean).slice(0, 5)
      : [],
    existing_description: a.existing_content?.product_description || "",
    existing_generic_keywords: Array.isArray(a.existing_content?.generic_keywords)
      ? a.existing_content.generic_keywords.filter(Boolean).slice(0, 5)
      : [],
    structured_facts: extractStructuredFacts(a),
  }));

  // Look up variety pack composition for any pack ASINs
  let varietyPackContext = "";
  try {
    const asinCodes = asins.map((a: any) => a.asin).filter(Boolean) as string[];
    if (asinCodes.length > 0) {
      const products = await db
        .select({ id: master.id, asin: master.asin })
        .from(master)
        .where(inArray(master.asin, asinCodes));

      if (products.length > 0) {
        const productIds = products.map((p) => p.id);
        const asinById = new Map(products.map((p) => [p.id, p.asin]));

        const vpItems = await db
          .select({
            packProductId: varietyPackItems.packProductId,
            flavor: varietyPackItems.flavor,
            size: varietyPackItems.size,
            color: varietyPackItems.color,
            style: varietyPackItems.style,
            customLabel: varietyPackItems.customLabel,
            units: varietyPackItems.units,
          })
          .from(varietyPackItems)
          .where(inArray(varietyPackItems.packProductId, productIds))
          .orderBy(varietyPackItems.sortOrder);

        if (vpItems.length > 0) {
          // Group by pack ASIN
          const byAsin = new Map<string, typeof vpItems>();
          for (const item of vpItems) {
            const asin = asinById.get(item.packProductId);
            if (asin) {
              if (!byAsin.has(asin)) byAsin.set(asin, []);
              byAsin.get(asin)!.push(item);
            }
          }

          const lines: string[] = [];
          for (const [asin, items] of byAsin) {
            const contents = items
              .map((it) => {
                const parts: string[] = [];
                if (it.units > 1) parts.push(`${it.units}x`);
                if (it.flavor) parts.push(it.flavor);
                if (it.size) parts.push(it.size);
                if (it.color) parts.push(it.color);
                if (it.style) parts.push(it.style);
                if (it.customLabel) parts.push(it.customLabel);
                return parts.join(" ") || "1 item";
              })
              .join(", ");
            lines.push(`- ${asin}: Contains ${contents}`);
          }
          if (lines.length > 0) {
            varietyPackContext = `\nVARIETY PACK COMPOSITION (include pack contents in content for these ASINs):\n${lines.join("\n")}\n`;
          }
        }
      }
    }
  } catch { /* non-critical — skip if VP lookup fails */ }

  const voiceBlock = getVoiceInstruction(contentVoice);

  // Load competitive intelligence if available (from S0 skill)
  let competitiveBlock = "";
  if (projectId) {
    try {
      const competitive = await loadCompetitiveData(projectId);
      if (competitive) {
        const parts: string[] = [];
        if (competitive.positioning?.strengths?.length) {
          parts.push(`Strengths to leverage: ${competitive.positioning.strengths.join("; ")}`);
        }
        if (competitive.positioning?.opportunities?.length) {
          parts.push(`Opportunities to address: ${competitive.positioning.opportunities.join("; ")}`);
        }
        if (competitive.keywordGaps?.length) {
          const highGaps = competitive.keywordGaps.filter(g => g.priority === "high").map(g => g.keyword);
          if (highGaps.length) parts.push(`High-priority keyword gaps: ${highGaps.join(", ")}`);
        }
        if (competitive.contentRecommendations?.length) {
          parts.push(`Content strategy: ${competitive.contentRecommendations.slice(0, 3).join("; ")}`);
        }
        if (parts.length) {
          competitiveBlock = `\nCOMPETITIVE INTELLIGENCE (S0 Analysis — use to differentiate content):\n${parts.map(p => `- ${p}`).join("\n")}\n`;
        }
      }
    } catch { /* non-critical — skip if competitive lookup fails */ }
  }

  const complianceRules = `
GROUNDING (ABSOLUTE — read SOURCE FACTS below before writing):
- Every concrete claim — numbers, dimensions, weights, times, temperatures, materials, ingredients, certifications, mechanisms, capabilities — MUST be supported by a SOURCE FACTS entry or a LIVE LISTING for the same ASIN.
- If a fact is not in SOURCE FACTS or LIVE LISTING, DO NOT WRITE IT. Do not infer from category norms, brand stereotypes, training data, or competitor patterns.
- Tier precedence: listing > group > variation > brand. When tiers conflict, the higher tier wins.
- Forbidden — invented competitive frames: "no ice", "no batteries", "unlike <category>", "beats <competitor type>" — unless SOURCE FACTS explicitly lists this as a positioning point.
- Forbidden — category drift: do NOT call the product a category that is not in SOURCE FACTS. If SOURCE FACTS says "neck cooling wrap" and LIVE LISTING confirms a 33×10 in towel, do NOT write "beach towel", "pool towel", or "<category> alternative" unless those terms appear in SOURCE FACTS.
- Forbidden — unverifiable attributes: "wrinkle-free", "holds water evenly", "works for everyone", "lasts forever", and any superlative not anchored to a SOURCE FACTS number or claim.
- When in doubt, omit the claim and write a different sentence about a verified fact.

COMPLIANCE (ABSOLUTE):
- NO medical/disease/treatment/cure/guarantee claims
- NO competitor names in content
- NO emoji or non-ASCII characters
- NO colons ":" in titles, descriptions, or the Item Highlight (ONLY in bullet ALL CAPS headers)
- Titles: hyphen "-" only separator, one space each side; 75 characters maximum
- No word >2x per title (case-insensitive)
- Keyword phrase max 1x per element
- Content must read human-written. Quality > keyword density.
${voiceBlock}

ALEXA FOR SHOPPING & COSMO OPTIMIZATION:
- Write content that ANSWERS questions a shopper would ask (optimized for Alexa for Shopping)
- Express product RELATIONSHIPS naturally (COSMO optimized) — who uses it, what it's for, when/where it's used
- Avoid keyword lists disguised as sentences. Each sentence should convey genuine product information.
- BAD example: "Premium organic turmeric curcumin supplement capsules with black pepper bioperine for joint support inflammation relief"
- GOOD example: "Premium Turmeric Curcumin with BioPerine - Supports Joint Comfort and Healthy Inflammation Response for Active Adults"
${buildSourceFactsBlock(guidelines, variationGuidelinesText, asinList)}${competitiveBlock}

${ANTI_AI_PATTERNS}`;

  let systemPrompt = "";
  let userPrompt = "";

  // Per-ASIN exclusion map — populated in case "backend", used for hard post-filter
  const perAsinWords = new Map<string, Set<string>>();

  switch (batch) {
    // ════════════════════════════════════════════════════════
    // BATCH 1: TITLES
    // ════════════════════════════════════════════════════════
    case "titles": {
      systemPrompt = `You are the Amazon Listing Title Generator for 1o8 SEO Manager.
${complianceRules}

${NATIVE_VOICE_CONTRACT}

TITLE RULES (Amazon 2026-07-27 mandate):
- One title per ASIN. HARD MAX 75 characters including spaces. Titles over 75 chars WILL BE REJECTED.
- Allowed chars: letters, numbers, spaces, hyphen "-". One space before AND after each hyphen. NO colons.
- STRUCTURE: Brand Name + highest-priority keyword phrase FIRST, then the most important 1-3 differentiators. Drop lower-priority detail to stay within 75 chars.
- A ≤75-char example: "Acme Organic Hot Sauce - Habanero Garlic Gourmet Blend - 7.5 Fl Oz"
- FRONT-LOAD (P21): the highest-priority approved keyword phrase MUST appear right after the brand name.
- KEYWORD COVERAGE: fit the highest-priority approved title keywords into the 75 chars. Keywords that do not fit go into the Item Highlight (see below) — together title + Item Highlight must cover ALL approved title-bucket keywords.
- Parent ASIN: Size="Parent" in data but do NOT put "Parent" in the title text.
${sizePlacement ? `- Size placement override: ${sizePlacement === "end" ? "end of title" : sizePlacement === "after-brand" ? "after brand name" : "after product descriptor"}` : ""}
- No filler phrases.

ITEM HIGHLIGHT RULES (new Amazon field, ≤125 characters):
- One Item Highlight per ASIN. HARD MAX 125 characters including spaces.
- Format: comma-separated Title-Case phrases (e.g. "Breathable Mesh, All-Day Comfort, Machine Washable"). NO colons.
- Must NOT repeat any word already used in the Title — it carries the OVERFLOW keywords plus concrete use cases.
- Together the Title (75) + Item Highlight (125) cover EVERY approved title-bucket keyword. Neither title nor Item Highlight keywords appear in bullets/description/backend (the reserved-keyword guarantee).

OUTPUT FORMAT: Return a JSON array. Each object = one ASIN with these exact keys:
{ "ASIN": "...", "Title": "...", "ItemHighlight": "..." }
Do NOT include character counts — they are computed server-side.`;

      const titleCosmo = filterCosmoForSection(cosmo, "Title");
      const allCosmoSummary = cosmo.slice(0, 20).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue}`).join("\n");

      userPrompt = `${buildRevisionBlock(feedback, "TITLES", getCurrentBatchContent("titles", currentRows), usedKeywords)}Generate titles for these ASINs.

Brand: ${brandName}
ASINs:\n${JSON.stringify(asinList, null, 1)}

Approved Title Keywords (RESERVED — split across Title + Item Highlight, do NOT use in bullets/description/backend):
Put the HIGHEST-priority keywords in the 75-char Title; flow the remainder into the 125-char Item Highlight. Cover ALL of them across the two fields.
${titleKeywordBlock}
${formatCosmoBlock(titleCosmo, "COSMO — TITLE-MAPPED RELATIONSHIPS (express these naturally in titles)")}

Full COSMO Map:\n${allCosmoSummary}

Alexa for Shopping Key Insights:\n${rufus.slice(0, 15).map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 150)}`).join("\n\n")}
${varietyPackContext}${feedback ? `\nREMINDER — REVISION FEEDBACK: ${feedback}\nEvery title MUST satisfy this feedback.` : ""}

Return ONLY valid JSON array.`;
      break;
    }

    // ════════════════════════════════════════════════════════
    // BATCH 2: BULLETS
    // ════════════════════════════════════════════════════════
    case "bullets": {
      systemPrompt = `You are the Amazon Bullet Point Generator for 1o8 SEO Manager.
${complianceRules}

${NATIVE_VOICE_CONTRACT}

BULLET RULES:
- ONE set of 5 bullets per ASIN (no other versions).
- LENGTH (strict): 180-200 characters per bullet, never more than 200.
- FORMAT: ALL CAPS summary header + colon + normal-case body.
- HEADER RULE (P21 — front-loading): The ALL CAPS header MUST state the concrete benefit or specific claim, not a generic label.
  BAD: "QUALITY:" "DURABILITY:" "FEATURES:"
  GOOD: "ABSORBS 20X BETTER:" "HOLDS 200 LBS:" "STAYS PUT ALL DAY:"
- BODY SHAPE (P3 — applies to every bullet body):
  feature -> benefit -> practical use/value
  Each bullet body must contain a concrete feature, a clear customer benefit, and a real-world use or value point — in that order.
- BULLET PURPOSES (P5 — each bullet covers a distinct angle; no overlap):
  B1: core value     [Consideration]
  B2: fit / scope    [Consideration]
  B3: workflow / instruction [Decision]
  B4: care / durability [Decision]
  B5: variation-specific for Child ASINs; falls back to "compatibility / accessory pairing" for Parent ASINs without variations [Decision]
- BALANCED COVERAGE (P18): across the 5 bullets, cover features, benefits, use cases, and value points roughly evenly — no two bullets should both be feature-heavy or both benefit-heavy.
- KEYWORD COUNT (P4): MIN 2 keywords + 1 partial variation per bullet. Max 1x per keyword phrase per bullet. Use ONLY the Approved Bullet Keywords list (already provided).
- LEXICAL VARIATION (P6 — narrow rule, CMOS parallelism still wins):
  Maintain grammatical parallelism — all 5 bullet bodies (after the ALL CAPS header) must open with the SAME grammatical pattern (e.g. all imperative verbs, or all noun phrases). NATIVE_VOICE_CONTRACT principle 7 still applies.
  BUT vary the lexical opener — no two bullets may begin with the same first word OR the same first 3-word phrase.
- No word repeated >2x per bullet (case-insensitive). No cross-bullet keyword duplication.

OUTPUT FORMAT: Return a JSON array. Each object = one ASIN with these exact keys:
{
  "ASIN": "...",
  "DetailedBulletPoint_1": "...",
  "DetailedBulletPoint_2": "...",
  "DetailedBulletPoint_3": "...",
  "DetailedBulletPoint_4": "...",
  "DetailedBulletPoint_5": "..."
}
Do NOT include CharLength fields — they are computed server-side.`;

      const approvedTitles = (currentRows || []).map((r: any) => `${r.ASIN}: ${r.Title}`).filter((s: string) => s.includes(": ")).join("\n");

      // Route COSMO relationships to specific bullets
      const bulletCosmo: Record<string, any[]> = {};
      for (let i = 1; i <= 5; i++) {
        bulletCosmo[`B${i}`] = filterCosmoForSection(cosmo, `Bullet ${i}`);
      }
      const bulletCosmoBlock = Object.entries(bulletCosmo)
        .filter(([, rows]) => rows.length > 0)
        .map(([bullet, rows]) => `${bullet}: ${rows.map((c: any) => `${c.COSMORelationType}→${c.COSMOMappedValue}`).join(", ")}`)
        .join("\n");

      userPrompt = `${buildRevisionBlock(feedback, "BULLETS", getCurrentBatchContent("bullets", currentRows), usedKeywords)}Generate all bullet points.

Brand: ${brandName}
ASINs:\n${JSON.stringify(asinList, null, 1)}

Approved Bullet Keywords (use ALL of these — RESERVED for bullets, NOT used in title):\n${bulletKws.map((k: any) => `- ${k.KeywordText}`).join("\n")}

Alexa for Shopping Q&A (express these insights in bullet content):\n${rufus.map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 200)}`).join("\n\n")}

COSMO → Bullet Mapping (each bullet should express its mapped relationships):\n${bulletCosmoBlock}

Full COSMO Map:\n${cosmo.slice(0, 20).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue}`).join("\n")}

Reviews:\n${reviews.slice(0, 10).map((r: any) => `${r.ReviewTheme || r.ReviewKeyThemes}: ${r.ReviewRufusUsableInsight || ""}`).join("\n")}

Approved Titles:\n${approvedTitles}
${varietyPackContext}${feedback ? `\nREMINDER — REVISION FEEDBACK: ${feedback}\nEvery bullet MUST satisfy this feedback.` : ""}

Return ONLY valid JSON array.`;
      break;
    }

    // ════════════════════════════════════════════════════════
    // BATCH 3: DESCRIPTION
    // ════════════════════════════════════════════════════════
    case "description": {
      systemPrompt = `You are the Amazon Product Description Generator for 1o8 SEO Manager.
${complianceRules}

DESCRIPTION RULES:
- One description per ASIN. Length: 1000-1200 characters.
- NO colons ":" allowed.
- Human narrative style. Awareness → Consideration buyer journey.
- Keywords naturally, density secondary. Never copy existing content verbatim.

OUTPUT FORMAT: Return a JSON array:
{ "ASIN": "...", "ProductDescription": "..." }
Do NOT include CharLength fields — they are computed server-side.`;

      const titlesCtx = (currentRows || []).map((r: any) => `${r.ASIN}: ${r.Title}`).filter((s: string) => s.includes(": ")).join("\n");
      const bulletsCtx = (currentRows || []).map((r: any) => `${r.ASIN} B1: ${(r.DetailedBulletPoint_1 || "").substring(0, 80)}...`).filter((s: string) => !s.endsWith(": ...")).join("\n");

      const descCosmo = filterCosmoForSection(cosmo, "Description");
      const titleBulletAllowed = [...distributed.title, ...distributed.bullets];
      const leftovers = computeLeftoverKeywords(titleBulletAllowed, currentRows || []);
      const allDescKws = [...descKws, ...leftovers].slice(0, 30);

      userPrompt = `${buildRevisionBlock(feedback, "DESCRIPTIONS", getCurrentBatchContent("description", currentRows), usedKeywords)}Generate product descriptions.

Brand: ${brandName}
ASINs:\n${JSON.stringify(asinList, null, 1)}

Titles:\n${titlesCtx}

Bullet summaries:\n${bulletsCtx}
${formatCosmoBlock(descCosmo, "COSMO — DESCRIPTION-MAPPED RELATIONSHIPS (weave these into the narrative)")}

Full COSMO Map:\n${cosmo.slice(0, 20).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue}`).join("\n")}

Alexa for Shopping Q&A (the description should implicitly answer these shopper questions):\n${rufus.map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 150)}`).join("\n\n")}

Approved Description Keywords (T3 + any title/bullet keywords NOT present in current title/bullets — use ALL of them):\n${allDescKws.map((k: any) => `- ${k.KeywordText}`).join("\n")}
${varietyPackContext}${feedback ? `\nREMINDER — REVISION FEEDBACK: ${feedback}\nEvery description MUST satisfy this feedback.` : ""}

Return ONLY valid JSON array.`;
      break;
    }

    // ════════════════════════════════════════════════════════
    // BATCH 4: BACKEND
    // ════════════════════════════════════════════════════════
    case "backend": {
      systemPrompt = `You are the Amazon Backend Search Terms Generator for 1o8 SEO Manager.
${complianceRules}

BACKEND RULES:
- ONE BackendSearchTerms field per ASIN. Maximum 249 bytes (UTF-8). Pack as close to 249 bytes as possible.
- Use ONLY the Approved Backend Keywords (already routed by KeywordPrimaryUseLocation) and never include words that already appear in the listing's title/bullets/description (per-ASIN exclusion enforced server-side).
- Never include words from the exclusion list — Amazon already indexes those from surface content.
- Never include negative keywords (wrong form/type/ingredient) — they attract irrelevant traffic.
- Lowercase. Space-separated. No punctuation except hyphens within compound words. No repeated words.
- No brand name. No competitor names. No prohibited terms.
- Prioritize: synonyms, spelling variants (US/UK), use-case expansions, materials, demographics, occasions.
- Output as ONE combined space-separated string.

OUTPUT FORMAT: Return a JSON array:
{ "ASIN": "...", "BackendSearchTerms": "..." }
Do NOT include ByteLength fields — they are computed server-side.`;

      // Build per-ASIN word exclusion sets from title + bullets + description
      const backendStopWords = new Set(["the","a","an","for","with","and","of","in","to","is","it","by","on","at","or","as","from","this","that","your","our","its","are","was","be","has","have","will","can","all","any","not","but","so","if","no","up","do","my"]);
      for (const row of currentRows || []) {
        const asin = String(row.ASIN || row.asin || "");
        if (!asin) continue;
        const asinWords = new Set<string>();
        const textSources = [
          row.Title || "",
          row.ProductDescription || "",
          row.DetailedBulletPoint_1 || "", row.DetailedBulletPoint_2 || "",
          row.DetailedBulletPoint_3 || "", row.DetailedBulletPoint_4 || "",
          row.DetailedBulletPoint_5 || "",
        ];
        for (const src of textSources) {
          for (const w of src.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
            if (w.length > 2 && !backendStopWords.has(w)) asinWords.add(w);
          }
        }
        perAsinWords.set(asin, asinWords);
      }
      // Combined set for prompt guidance (advisory — hard filter applied server-side)
      const allListingWords = new Set<string>();
      for (const ws of perAsinWords.values()) for (const w of ws) allListingWords.add(w);

      // Negative keywords from S2 — must not appear in backend
      const negativeKws = (keywords || [])
        .filter((k: any) => k.KeywordIsNegative)
        .map((k: any) => String(k.KeywordText).toLowerCase());

      const exclusionBlock = allListingWords.size > 0
        ? `\nWORDS ALREADY INDEXED (title + bullets + descriptions — exclude from backend):\n${[...allListingWords].join(" ")}`
        : "";
      const negativeBlock = negativeKws.length > 0
        ? `\nNEGATIVE KEYWORDS (wrong form/type/ingredient — never include):\n${negativeKws.join(", ")}`
        : "";

      userPrompt = `${buildRevisionBlock(feedback, "BACKEND SEARCH TERMS", getCurrentBatchContent("backend", currentRows), usedKeywords, true)}Generate backend search terms.

⚠️ HARD CAP — NON-NEGOTIABLE: Each ASIN's BackendSearchTerms MUST be ≤ 249 bytes (UTF-8). Even 1 byte over de-indexes ALL keywords for that ASIN. Count bytes before returning; drop lowest-tier terms first if over. This rule overrides the must-keep list.
Pack as close to 249 bytes as possible — unused bytes are wasted indexing opportunities.

ASINs: ${asinList.map((a: any) => `${a.asin} (${a.parentage_level})`).join(", ")}

Approved Backend Keywords (use ALL of these — RESERVED for backend, NOT used in title/bullets/description):\n${backendKws.map((k: any) => k.KeywordText).join(", ")}
${exclusionBlock}${negativeBlock}
${feedback ? `\nREMINDER — REVISION FEEDBACK: ${feedback}\nBackend terms MUST satisfy this feedback.` : ""}

Return ONLY valid JSON array.`;
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown batch: ${batch}` }, { status: 400 });
  }

  // ── Helper: call Claude and parse JSON array from response ──
  async function callClaudeAndParse(sysPrompt: string, usrPrompt: string, model: string, maxTokens: number) {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: sysPrompt,
        messages: [{ role: "user", content: usrPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || "";

    // Strip markdown code fences, then find balanced JSON array
    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const arrStart = cleaned.indexOf("[");
    if (arrStart === -1) throw new Error("No JSON array in Claude response");
    let depth = 0;
    let arrEnd = -1;
    let inString = false;
    let escape = false;
    for (let i = arrStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { arrEnd = i; break; } }
    }
    let jsonStr: string;
    if (arrEnd === -1) {
      const partial = cleaned.slice(arrStart);
      let candidate = "";
      let pos = partial.lastIndexOf("}");
      while (pos > 0) {
        candidate = partial.slice(0, pos + 1) + "]";
        try { JSON.parse(candidate); break; } catch { candidate = ""; pos = partial.lastIndexOf("}", pos - 1); }
      }
      if (!candidate) throw new Error("No complete JSON array in Claude response");
      jsonStr = candidate;
    } else {
      jsonStr = cleaned.slice(arrStart, arrEnd + 1);
    }
    return { rows: JSON.parse(jsonStr) as any[], usage: claudeData.usage };
  }

  // ── Helper: compute char/byte lengths server-side ──
  function computeLengths(rows: any[]) {
    const SKIP_FIELDS = new Set(["ASIN"]);
    const BYTE_FIELDS = new Set(["BackendSearchTerms"]);
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (SKIP_FIELDS.has(key) || key.endsWith("_CharLength") || key.endsWith("_ByteLength")) continue;
        if (typeof row[key] === "string") {
          if (BYTE_FIELDS.has(key)) {
            row[`${key}_ByteLength`] = new TextEncoder().encode(row[key]).length;
          } else {
            row[`${key}_CharLength`] = row[key].length;
          }
        }
      }
    }
  }

  // ── SSE streaming response ──
  // Emit progress events between passes so the client can show a pass stepper.
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const sseWriter = writable.getWriter();

  const sendEvent = async (obj: unknown) => {
    try { await sseWriter.write(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* stream closed */ }
  };

  (async () => {
    try {
      const configBlock = await getConfigDocBlock(6000);
      const finalSystemPrompt = configBlock ? `${configBlock}\n\n${systemPrompt}` : systemPrompt;

      // Pass 1 — Main content generation
      await sendEvent({ type: "progress", pass: 1 });
      let { rows, usage: totalUsage } = await callClaudeAndParse(finalSystemPrompt, userPrompt, aiConfig.model, aiConfig.maxTokens);

      let humanScores: HumanScore[] = [];
      if (batch === "titles" || batch === "bullets") {
        const mustKeep = [...new Set([
          ...(usedKeywords || []),
          ...keywords.filter((k: any) => k.KeywordPriorityTier === "T1" || k.KeywordPriorityTier === "T2").map((k: any) => k.KeywordText),
        ])].filter(Boolean) as string[];

        // Pass 2 — Voice & tone
        await sendEvent({ type: "progress", pass: 2 });
        rows = await humanizeRows(batch as "titles" | "bullets", rows, mustKeep, apiKey!, aiConfig.model, aiConfig.maxTokens);

        // Pass 3 — CMOS editorial
        await sendEvent({ type: "progress", pass: 3 });
        rows = await cmosRows(batch as "titles" | "bullets", rows, mustKeep, apiKey!, aiConfig.model, aiConfig.maxTokens);

        if (batch === "bullets") {
          // ── Resilience: emit a PRELIMINARY result with the post-CMOS bullets
          // BEFORE the coherence pass. Coherence (Pass 4) is the longest, bullets-
          // only step and runs last; if the platform terminates the function mid-
          // coherence (time limit / OOM) or the final result write is lost, the
          // client keeps this fallback instead of ending the stream with no data
          // and throwing "No result received for bullets". The client overwrites
          // `data` with the final (post-coherence, scored) result below if Pass 4
          // completes. SSE flushes incrementally in prod (the pass stepper proves
          // it), so these bytes reach the client even if a later kill follows.
          // Best-effort: a failure here must never derail real generation.
          try {
            const prelimRows = rows.map((r: any) => ({ ...r }));
            for (const row of prelimRows) {
              if (!row.ASIN && row.asin) { row.ASIN = row.asin; delete row.asin; }
              delete row.asin_CharLength;
            }
            computeLengths(prelimRows);
            await sendEvent({ type: "result", rows: prelimRows, usage: totalUsage, preliminary: true });
          } catch { /* preliminary result is best-effort */ }

          const descMap = new Map<string, string>(
            (currentRows || [])
              .filter((r: any) => r?.ASIN && r?.ProductDescription)
              .map((r: any) => [r.ASIN as string, r.ProductDescription as string])
          );
          // Pass 4 — Coherence + Human Score
          await sendEvent({ type: "progress", pass: 4 });
          const coherenceResult = await coherenceRows(rows, descMap, mustKeep, apiKey!, aiConfig.model, aiConfig.maxTokens);
          rows = coherenceResult.rows;
          humanScores = coherenceResult.humanScores;
        }
      }

      // Normalize ASIN key — Claude sometimes returns lowercase "asin"
      for (const row of rows) {
        if (!row.ASIN && row.asin) {
          row.ASIN = row.asin;
          delete row.asin;
        }
        delete row.asin_CharLength;
      }

      // ── Auto-fix titles that miss character limits ──
      if (batch === "titles") {
        const { min, max } = CHAR_LIMITS.title;
        const getFailingTitles = (r: any[]) => r.filter((row: any) => {
          const len = (row.Title || "").length;
          return len < min || len > max;
        });
        let failing = getFailingTitles(rows);
        if (failing.length > 0) {
          try {
            const failLines = failing.map((r: any) =>
              `{"ASIN":"${r.ASIN}","Title":"${r.Title}","chars":${(r.Title||"").length}}`
            ).join("\n");
            const retryPrompt = `Rewrite these titles to ${max} characters or fewer each, keeping the brand + highest-priority keyword first. Remove lower-priority detail to fit.\n\n${failLines}\n\nReturn ONLY JSON array: [{"ASIN":"...","Title":"..."}]`;
            const retry = await callClaudeAndParse(finalSystemPrompt, retryPrompt, aiConfig.model, aiConfig.maxTokens);
            const retryMap = new Map(retry.rows.map((r: any) => [r.ASIN, r.Title]));
            for (const row of rows) {
              const newTitle = retryMap.get(row.ASIN);
              if (newTitle && newTitle.length >= min && newTitle.length <= max) row.Title = newTitle;
            }
            totalUsage = {
              input_tokens: (totalUsage?.input_tokens || 0) + (retry.usage?.input_tokens || 0),
              output_tokens: (totalUsage?.output_tokens || 0) + (retry.usage?.output_tokens || 0),
            };
          } catch { /* fallback to programmatic trim */ }
        }
        for (const row of rows) {
          const len = (row.Title || "").length;
          if (len > max) {
            let trimmed = row.Title.slice(0, max);
            const lastSep = trimmed.lastIndexOf(" - ");
            if (lastSep > min - 20) trimmed = trimmed.slice(0, lastSep);
            row.Title = trimmed;
          }
        }
      }

      // ── Item Highlight: Title-Case normalize + strip colons + hard-cap 125 chars ──
      if (batch === "titles") {
        const toTitleCase = (s: string) =>
          s.toLowerCase().replace(/\b([a-z])(\w*)/g, (_m, a, b) => a.toUpperCase() + b);
        for (const row of rows) {
          let ih = String(row.ItemHighlight || "").replace(/:/g, "").replace(/\s+/g, " ").trim();
          ih = toTitleCase(ih);
          if (ih.length > 125) {
            let trimmed = ih.slice(0, 125);
            const lastComma = trimmed.lastIndexOf(",");
            if (lastComma > 40) trimmed = trimmed.slice(0, lastComma);
            ih = trimmed.trim().replace(/,\s*$/, "");
          }
          row.ItemHighlight = ih;
        }
      }

      // ── Strip visible-content words (hard enforcement, per ASIN) ──
      if (batch === "backend") {
        for (const row of rows) {
          const excluded = perAsinWords.get(String(row.ASIN || ""));
          if (!excluded || !row.BackendSearchTerms) continue;
          row.BackendSearchTerms = String(row.BackendSearchTerms)
            .split(/\s+/)
            .filter((w: string) => w && !excluded.has(w.toLowerCase()))
            .join(" ");
        }
      }

      // ── Hard-cap backend search terms at 249 bytes ──
      if (batch === "backend") {
        const MAX_BYTES = 249;
        const byteEnc = new TextEncoder();
        for (const row of rows) {
          const original: string = String(row.BackendSearchTerms || "");
          if (!original) continue;
          if (byteEnc.encode(original).length <= MAX_BYTES) continue;
          const terms = original.split(/\s+/).filter(Boolean);
          while (terms.length && byteEnc.encode(terms.join(" ")).length > MAX_BYTES) terms.pop();
          row.BackendSearchTerms = terms.join(" ");
        }
      }

      computeLengths(rows);

      logEvent({
        userEmail: session?.user?.email,
        userName: session?.user?.name,
        section: "seo",
        action: `claude:seo:${batch}`,
        status: "success",
        resourceLabel: brandName,
        message: `Generated ${batch} for ${rows.length} ASINs`,
        detail: { batch, asinsCount: rows.length, usage: totalUsage, hasFeedback: !!feedback },
        durationMs: Date.now() - startTime,
      });

      // Final score = code-scored word patterns on the final text + the model's frozen judgment rows.
      humanScores = humanScores.map((hs) => {
        const row = rows.find((r: any) => r.ASIN === hs.asin);
        return row ? computeHumanScore(row, { ...hs, accepted: [] }) : hs;
      });
      await sendEvent({ type: "result", rows, usage: totalUsage, ...(humanScores.length > 0 && { humanScores }) });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : `Failed to generate ${batch}`;
      logEvent({
        userEmail: session?.user?.email,
        userName: session?.user?.name,
        section: "seo",
        action: `claude:seo:${batch}`,
        status: "error",
        resourceLabel: brandName,
        message: errMsg,
        detail: { batch, error: errMsg },
        durationMs: Date.now() - startTime,
      });
      await sendEvent({ type: "error", error: errMsg });
    } finally {
      try { await sseWriter.close(); } catch { /* already closed */ }
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
