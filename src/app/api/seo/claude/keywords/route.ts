/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S2 Keyword Tiering API — Claude AI
// POST /api/claude/keywords
// Batches run in PARALLEL
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getConfigDocBlock } from "@/lib/seo-config-doc";
import { getAuthSession } from "@/lib/auth-db";
import { logEvent } from "@/lib/event-logger";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

const BATCH_SIZE = 100;

const SYSTEM_PROMPT = `You are the Keyword Intelligence and Tiering Engine for Amazon SEO (ALEXA FOR SHOPPING + COSMO).

TASK: For each keyword, assign Priority Tier, Search Intent, Use Location, Match Type, COSMO Relationship, Buyer Stage, Semantic Group, and Negative flags.

TIERING RULES (SEO placement — tier and primary use location are 1:1; the downstream content generator routes purely on loc):
- T1: High purchase intent → loc: "Title". Match: Exact. 5-8 keywords total across all batches.
- T2: Mid-funnel → loc: "Bullet Points". Match: Phrase. 10-15 keywords total.
- T3: Semantic expansion → loc: "Description". Match: Phrase. 15-20 keywords total.
- T4: Long-tail / awareness → loc: "Backend Search Terms". Match: Exact or Broad. Everything else.
- HARD RULE: Every keyword has EXACTLY one tier AND EXACTLY one location, and the pair MUST match the table above. T1 with loc="Bullet Points" is forbidden — pick a tier that matches the loc or fix the loc.
- HARD RULE: No keyword in more than one tier. No duplicate keyword phrases across batches (compare lowercase).
- Intent (int) is independent of tier — Informational keywords can still land in T1 if purchase intent is high.

SEMANTIC GROUPS (PPC campaign grouping — assign exactly one per keyword):
- CoreProduct: exact product type, high-intent buyer terms
- Ingredient: material, ingredient, format, physical attribute terms
- Language: non-English terms (Spanish, Portuguese, etc.)
- GenericCat: broad category discovery terms (cap at 20 per group)
- Benefit: use-case, benefit, occasion, demographic terms
- Competitor: contains a competitor brand name — ONLY place brand terms here

NEGATIVE KEYWORDS (flag keywords that should NOT be targeted):
- Set neg:true when the keyword describes: wrong product form (seed/plant/capsule/oil when selling a different form), wrong ingredient, wrong product type/category, or irrelevant adjacent category
- Set nc to one of: WrongForm | WrongType | WrongIngredient | CompetitorBrand | WrongCat
- Competitor brand keywords are NOT negatives — they go in Competitor group with ic:true
- Negatives still get a tier (T4) and loc (Backend) but sg should be empty
- CATEGORY DRIFT: If BRAND GUIDELINES explicitly states the product category (e.g. "cooling towel", "resistance band") and a keyword implies a materially different product form that the brand does NOT make, mark neg=true with nc="CATEGORY_DRIFT". Examples: brand sells cooling towels → "beach towel", "pool towel", "microfiber bath towel" are CATEGORY_DRIFT. Brand sells resistance bands → "dumbbells", "kettlebells" are CATEGORY_DRIFT. Do NOT apply this to keywords that simply describe a use context (e.g. "towel for beach" for a cooling towel is fine — the product CAN be used there).

RULES:
- Never put competitor brand terms in CoreProduct/Ingredient/Language/GenericCat/Benefit groups
- A keyword in the Competitor group gets ic:true
- Negatives get neg:true — they are excluded from targeting but still indexed
- Choose quality over quantity for semantic groups (≤30 per group except GenericCat ≤20)

BUYER STAGE: Awareness | Consideration | Decision
COSMO: USED_FOR_FUNC | USED_TO | CAPABLE_OF | USED_FOR_EVE | USED_ON | USED_IN_LOC | USED_AS | IS_A | xIS_A | USED_IN_BODY | USED_WITH | USED_FOR_AUD | USED_BY | xINTERESTED_IN | xWANT
INTENT: Informational | Commercial | Navigational | Transactional
SCORING: (Relevancy×0.45) + (NormVolume×0.35) + (BuyerStageWeight×0.20). Decision=1.0, Consideration=0.7, Awareness=0.4.

OUTPUT: Return ONLY a JSON array. Each element:
{"t":"keyword","v":number,"tier":"T1","int":"Transactional","loc":"Title","mt":"Exact","cos":"USED_FOR_FUNC","bs":"Decision","n":"note","sg":"CoreProduct","neg":false,"nc":"","ic":false}

Field key mapping: t=text, v=volume, tier=priorityTier, int=searchIntent, loc=useLocation, mt=matchType, cos=cosmoRelationship, bs=buyerStage, n=notes, sg=semanticGroup, neg=isNegative, nc=negativeCategory, ic=isCompetitor.

Use SHORT keys. Return ONLY the JSON array — no markdown, no explanation, no code fences.`;

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

  let body: any;

  try {
    body = await req.json();
    const { keywords, brandName, variationProduct, variationTheme, competitors, guidelines } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: "No keywords provided" }, { status: 400 });
    }

    if (!brandName) {
      return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
    }

    const aiConfig = await getAiFeatureConfig("seo_keywords");
    if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

    // Limit to top 400 (200 product + 200 competitor, enforced by frontend)
    const topKeywords = keywords.slice(0, 400);

    // Split into batches
    const batches: any[][] = [];
    for (let i = 0; i < topKeywords.length; i += BATCH_SIZE) {
      batches.push(topKeywords.slice(i, i + BATCH_SIZE));
    }

    const guidelinesBlock = guidelines
      ? `BRAND GUIDELINES (apply to tone, intent signals, audience keywords):\n${String(guidelines)}\n`
      : "";

    const configBlock = await getConfigDocBlock(3000);
    const effectiveSystemPrompt = configBlock
      ? `${configBlock}\n\n${SYSTEM_PROMPT}`
      : SYSTEM_PROMPT;

    // Tier budget per batch (distributed evenly)
    const t1PerBatch = Math.max(1, Math.ceil(8 / batches.length));
    const t2PerBatch = Math.max(2, Math.ceil(15 / batches.length));


    // Run ALL batches in parallel to fit within 60s Vercel timeout
    const results = await Promise.all(
      batches.map(async (batch, batchIdx) => {
        const kwLines = batch
          .map((kw: any) => `${kw.keyword_phrase}\t${kw.search_volume}\t${kw.cerebro_iq_score ?? ""}\t${kw.competing_products ?? ""}\t${kw.title_density ?? ""}\t${kw.cpr ?? ""}\t${kw.keyword_source ?? "Client"}`)
          .join("\n");

        const tierGuidance = `This is batch ${batchIdx + 1} of ${batches.length}. Assign max ${t1PerBatch} T1, ${t2PerBatch} T2, rest split T3/T4.`;

        const userPrompt = `Product: ${brandName} — ${variationProduct || "Product"}
Theme: ${variationTheme || "N/A"}
${guidelinesBlock}${tierGuidance}

Batch ${batchIdx + 1}/${batches.length} (${batch.length} keywords):
Keyword\tVolume\tIQ\tCompetition\tTitleDensity\tCPR\tResearchSource
${kwLines}

Return JSON array for ALL ${batch.length} keywords using short keys.`;

        const response = await getAnthropicClient().messages.create({
          model: aiConfig.model,
          max_tokens: aiConfig.maxTokens,
          system: effectiveSystemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        const usage = response.usage || { input_tokens: 0, output_tokens: 0 };

        const text = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block.type === "text" ? block.text : ""))
          .join("");

        const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

        let parsed: any[];
        try {
          parsed = JSON.parse(clean);
        } catch {
          const lastBracket = clean.lastIndexOf("}");
          if (lastBracket > 0) {
            try {
              parsed = JSON.parse(clean.substring(0, lastBracket + 1) + "]");
            } catch {
              console.error(`Batch ${batchIdx + 1} JSON parse failed. Raw length: ${clean.length}`);
              return { keywords: [], usage };
            }
          } else {
            return { keywords: [], usage };
          }
        }

        const expanded = parsed.map((kw: any) => ({
          KeywordText: kw.t || kw.KeywordText || "",
          KeywordSearchVolume: kw.v || kw.KeywordSearchVolume || 0,
          KeywordPriorityTier: kw.tier || kw.KeywordPriorityTier || "T4",
          KeywordSearchIntent: kw.int || kw.KeywordSearchIntent || "",
          KeywordPrimaryUseLocation: expandLocation(kw.loc || kw.KeywordPrimaryUseLocation || "Backend Search Terms"),
          KeywordMatchType: kw.mt || kw.KeywordMatchType || "Broad",
          KeywordCOSMORelationship: kw.cos || kw.KeywordCOSMORelationship || "",
          KeywordBuyerStage: kw.bs || kw.KeywordBuyerStage || "Awareness",
          KeywordNotes: kw.n || kw.KeywordNotes || "",
          KeywordSemanticGroup: kw.sg || kw.KeywordSemanticGroup || "",
          KeywordIsNegative: Boolean(kw.neg ?? kw.KeywordIsNegative ?? false),
          KeywordNegativeCategory: kw.nc || kw.KeywordNegativeCategory || "",
          KeywordIsCompetitor: Boolean(kw.ic ?? kw.KeywordIsCompetitor ?? false),
        }));

        return { keywords: expanded, usage };
      })
    );

    // Merge results
    const allTiered: any[] = [];
    const totalUsage = { input_tokens: 0, output_tokens: 0 };
    for (const r of results) {
      allTiered.push(...r.keywords);
      totalUsage.input_tokens += r.usage.input_tokens;
      totalUsage.output_tokens += r.usage.output_tokens;
    }


    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:keywords",
      status: "success",
      resourceType: "brand",
      resourceLabel: brandName,
      message: `Tiered ${allTiered.length} keywords in ${batches.length} batches`,
      detail: { keywordsIn: topKeywords.length, keywordsOut: allTiered.length, batches: batches.length, usage: totalUsage },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      keywords: allTiered,
      model: aiConfig.model,
      usage: totalUsage,
      batches: batches.length,
    });
  } catch (err: unknown) {
    console.error("Claude API error:", err);
    const errMsg = err instanceof Error ? err.message : "Failed to process keywords";
    const errStatus = err instanceof Anthropic.APIError ? err.status : undefined;

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:keywords",
      status: "error",
      resourceLabel: body?.brandName,
      message: errMsg,
      detail: { error: errMsg },
      durationMs: Date.now() - startTime,
    });

    if (errMsg.includes("ANTHROPIC_API_KEY not configured")) {
      return NextResponse.json(
        { error: "Anthropic API key is not configured. Contact an admin." },
        { status: 500 }
      );
    }

    if (errMsg.includes("authentication") || errMsg.includes("api_key") || errStatus === 401) {
      return NextResponse.json(
        { error: "Invalid Anthropic API key. Check your .env.local ANTHROPIC_API_KEY." },
        { status: 401 }
      );
    }

    if (errStatus === 404 || errMsg.includes("not_found")) {
      return NextResponse.json(
        { error: "Invalid AI model configured. Go to SEO Config and select a valid model." },
        { status: 500 }
      );
    }

    if (errStatus === 429) {
      return NextResponse.json(
        { error: "Anthropic rate limit reached. Try again in a minute." },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "Failed to process keywords. Check server logs for details." },
      { status: 500 }
    );
  }
}

function expandLocation(loc: string): string {
  const map: Record<string, string> = {
    "Title": "Title",
    "Bullets": "Bullet Points",
    "Bullet Points": "Bullet Points",
    "Description": "Description",
    "Backend": "Backend Search Terms",
    "Backend Search Terms": "Backend Search Terms",
  };
  return map[loc] || loc;
}
