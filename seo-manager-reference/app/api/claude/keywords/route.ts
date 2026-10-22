/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S2 Keyword Tiering API — Claude AI
// POST /api/claude/keywords
// Batches run in PARALLEL to fit within Vercel 60s timeout
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: fetch,
});

const BATCH_SIZE = 100;

const SYSTEM_PROMPT = `You are the Keyword Intelligence and Tiering Engine for Amazon SEO (RUFUS + COSMO).

TASK: For each keyword, assign Priority Tier, Search Intent, Use Location, Match Type, COSMO Relationship, Buyer Stage, and a short Note.

TIERING RULES:
- T1: High purchase intent → Title. Match: Exact. 5-8 keywords total across all batches.
- T2: Mid-funnel → Bullet Points. Match: Phrase. 10-15 keywords total.
- T3: Semantic expansion → Description. Match: Phrase. 15-20 keywords total.
- T4: Long-tail/awareness → Backend. Match: Exact or Broad. Everything else.
- No keyword in more than one tier.

BUYER STAGE: Awareness | Consideration | Decision
COSMO: IS_A | HAS_A | USED_FOR | USED_FOR_AUD | MADE_OF | SOLD_AS | COMPARED_TO | INTERESTED_IN | AVAILABLE_IN
INTENT: Informational | Commercial | Navigational | Transactional

SCORING: (Relevancy×0.45) + (NormVolume×0.35) + (BuyerStageWeight×0.20). Decision=1.0, Consideration=0.7, Awareness=0.4.

OUTPUT: Return ONLY a JSON array. Each element:
{"t":"keyword","v":number,"tier":"T1","int":"Transactional","loc":"Title","mt":"Exact","cos":"USED_FOR","bs":"Decision","n":"note"}

Field key mapping: t=KeywordText, v=SearchVolume, tier=PriorityTier, int=SearchIntent, loc=PrimaryUseLocation, mt=MatchType, cos=COSMORelationship, bs=BuyerStage, n=Notes.

Use these SHORT keys to save space. Return ONLY the JSON array — no markdown, no explanation, no code fences.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { keywords, brandName, variationProduct, variationTheme, competitors, guidelines } = body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: "No keywords provided" }, { status: 400 });
    }

    if (!brandName) {
      return NextResponse.json({ error: "Brand name is required" }, { status: 400 });
    }

    // Limit to top 400 (200 product + 200 competitor, enforced by frontend)
    const topKeywords = keywords.slice(0, 400);

    // Split into batches
    const batches: any[][] = [];
    for (let i = 0; i < topKeywords.length; i += BATCH_SIZE) {
      batches.push(topKeywords.slice(i, i + BATCH_SIZE));
    }

    const guidelinesBlock = guidelines
      ? `BRAND GUIDELINES (apply to tone, intent signals, audience keywords):\n${String(guidelines).substring(0, 600)}\n`
      : "";

    // Tier budget per batch (distributed evenly)
    const t1PerBatch = Math.max(1, Math.ceil(8 / batches.length));
    const t2PerBatch = Math.max(2, Math.ceil(15 / batches.length));

    console.log(`Keywords: ${topKeywords.length} in ${batches.length} parallel batches`);

    // Run ALL batches in parallel to fit within 60s Vercel timeout
    const results = await Promise.all(
      batches.map(async (batch, batchIdx) => {
        const kwLines = batch
          .map((kw: any) => `${kw.keyword_phrase}\t${kw.search_volume}\t${kw.cerebro_iq_score || ""}\t${kw.competing_products || ""}\t${kw.title_density || ""}\t${kw.cpr || ""}`)
          .join("\n");

        const tierGuidance = `This is batch ${batchIdx + 1} of ${batches.length}. Assign max ${t1PerBatch} T1, ${t2PerBatch} T2, rest split T3/T4.`;

        const userPrompt = `Product: ${brandName} — ${variationProduct || "Product"}
Theme: ${variationTheme || "N/A"}
${guidelinesBlock}${tierGuidance}

Batch ${batchIdx + 1}/${batches.length} (${batch.length} keywords):
Keyword\tVolume\tIQ\tCompetition\tTitleDensity\tCPR
${kwLines}

Return JSON array for ALL ${batch.length} keywords using short keys.`;

        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
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

    console.log(`Keywords done: ${allTiered.length} tiered, ${totalUsage.input_tokens + totalUsage.output_tokens} tokens`);

    return NextResponse.json({
      keywords: allTiered,
      model: "claude-haiku-4-5-20251001",
      usage: totalUsage,
      batches: batches.length,
    });
  } catch (err: any) {
    console.error("Claude API error:", err);

    if (err.message?.includes("authentication") || err.message?.includes("api_key") || err.status === 401) {
      return NextResponse.json(
        { error: "Invalid Anthropic API key. Check your .env.local ANTHROPIC_API_KEY." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: err.message || "Failed to process keywords" },
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
