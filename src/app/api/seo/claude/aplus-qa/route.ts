import { NextRequest, NextResponse } from "next/server";
import { productTextLines } from "@/lib/seo/aplus-qa-context";
import { getAuthSession } from "@/lib/auth-db";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { checkRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { seoReviews, seoRufus, seoCosmopMaps } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const maxDuration = 120;

export interface QAPair { q: string; a: string; }
export interface AsinQA { asin: string; questions: QAPair[]; }

const SYSTEM_PROMPT = `You are an Amazon A+ Premium Content specialist writing Module 7 (premium_qa) Q&A pairs.

HARD RULES:
- Exactly 5 Q&A pairs per ASIN.
- Q (question): 115–120 characters exactly. Decision-stage buyer question — addresses a purchase objection, use-case fit, or key differentiator. Conversational and specific, as a real shopper would ask.
- A (answer): 245–250 characters exactly. Complete, benefit-led answer. Start with a direct answer then supporting detail. No colons. No brand name repetition.

SOURCING PRIORITY (use in this order):
1. Customer reviews — surface the most repeated questions and objections real buyers raised. If an objection appears in the reviews, one Q&A pair MUST address it directly.
2. Alexa for Shopping shopper questions — mirror the intent of questions real Alexa for Shopping users asked about this product.
3. COSMO relationships — reinforce the strongest product associations (use case, benefit, compatibility).
4. Approved listing content (bullets/description) — ground every answer here; do not invent claims.

VOICE (non-negotiable):
- Native American English — direct, benefit-led, no AI vocabulary
- Banned: delve, tapestry, foster, underscore, align with, crucial, pivotal, serves as, stands as, represents a
- Use contractions naturally (doesn't, you'll, it's, won't)
- No "This product…" — use "Our [product]…" or a direct answer

CONTENT:
- If ASIN is a child variant, Q5 must address its specific variation differentiator
- No medical/disease/treatment/cure claims. No competitor names. No emoji. No colons in answers.

OUTPUT: Return ONLY a valid JSON array — no markdown, no explanation:
[
  {
    "asin": "B0XXXXXXX",
    "questions": [
      { "q": "115–120 char question here", "a": "245–250 char answer here" },
      { "q": "...", "a": "..." },
      { "q": "...", "a": "..." },
      { "q": "...", "a": "..." },
      { "q": "...", "a": "..." }
    ]
  }
]

BEFORE RETURNING: count every Q and A character. If any Q is outside 115–120 or any A is outside 245–250, rewrite that pair until it fits.`;

type ReviewRow = {
  asin: string | null;
  starRating: number | null;
  keyThemes: string | null;
  rufusUsableInsight: string | null;
  helpfulVotes: number;
};

function buildReviewsByAsin(reviews: ReviewRow[]): Map<string, ReviewRow[]> {
  const map = new Map<string, ReviewRow[]>();
  for (const r of reviews) {
    const key = r.asin || "__global__";
    const existing = map.get(key) || [];
    existing.push(r);
    map.set(key, existing);
  }
  return map;
}

function buildContext(
  row: any,
  reviewsByAsin: Map<string, ReviewRow[]>,
): string {
  const lines: string[] = [`ASIN: ${row.ASIN}`];
  if (row.ParentageLevel) lines.push(`Type: ${row.ParentageLevel}`);
  if (row.Flavor || row.Style || row.Color || row.Size) {
    const variant = [row.Flavor, row.Style, row.Color, row.Size].filter(Boolean).join(" / ");
    lines.push(`Variant: ${variant}`);
  }
  lines.push(...productTextLines(row));

  // Per-ASIN review themes + objections
  const asinReviews = [
    ...(reviewsByAsin.get(row.ASIN) || []),
    ...(reviewsByAsin.get("__global__") || []),
  ];
  const themes = asinReviews
    .filter((r) => r.keyThemes)
    .map((r) => r.keyThemes!)
    .slice(0, 5);
  const objections = asinReviews
    .filter((r) => (r.starRating ?? 5) <= 2 && r.rufusUsableInsight)
    .map((r) => r.rufusUsableInsight!)
    .slice(0, 3);
  const praised = asinReviews
    .filter((r) => (r.starRating ?? 3) >= 4 && r.rufusUsableInsight)
    .map((r) => r.rufusUsableInsight!)
    .slice(0, 3);

  if (themes.length) lines.push(`Customer themes: ${themes.join(" | ")}`);
  if (objections.length) lines.push(`Objections to address: ${objections.join(" | ")}`);
  if (praised.length) lines.push(`Praised aspects: ${praised.join(" | ")}`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const rlKey = session?.user?.email || req.headers.get("x-forwarded-for") || "anonymous";
  const rl = checkRateLimit(rlKey, 10, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  const aiConfig = await getAiFeatureConfig("seo_content");
  if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

  const body = await req.json();
  const { brandName, keywords, rows, guidelines, projectId } = body;

  if (!rows?.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

  const tier1 = (keywords || []).filter((k: any) => k.KeywordPriorityTier === "T1").slice(0, 15);
  const kwList = tier1.map((k: any) => k.KeywordText).join(", ");

  // ── Fetch S3/S4/S5 context from DB ──────────────────────────
  let reviewsByAsin = new Map<string, ReviewRow[]>();
  let rufusContext = "";
  let cosmoContext = "";

  if (projectId) {
    const [reviewRows, rufusRow, cosmoRow] = await Promise.all([
      db.select({
        asin: seoReviews.asin,
        starRating: seoReviews.starRating,
        keyThemes: seoReviews.keyThemes,
        rufusUsableInsight: seoReviews.rufusUsableInsight,
        helpfulVotes: seoReviews.helpfulVotes,
      }).from(seoReviews)
        .where(eq(seoReviews.projectId, projectId))
        .orderBy(desc(seoReviews.helpfulVotes))
        .limit(50),

      db.select({
        phase1Questions: seoRufus.phase1Questions,
        phase1Answers: seoRufus.phase1Answers,
        optimizationSummary: seoRufus.optimizationSummary,
      }).from(seoRufus).where(eq(seoRufus.projectId, projectId)).limit(1),

      db.select({ triples: seoCosmopMaps.triples })
        .from(seoCosmopMaps).where(eq(seoCosmopMaps.projectId, projectId)).limit(1),
    ]);

    reviewsByAsin = buildReviewsByAsin(reviewRows);

    // Alexa for Shopping: zip phase1Questions + phase1Answers for top 8 pairs
    const rufus = rufusRow[0];
    if (rufus?.phase1Questions?.length) {
      const pairs = (rufus.phase1Questions as Array<{ text: string }>)
        .slice(0, 8)
        .map((q, i) => {
          const a = (rufus.phase1Answers as string[] | null)?.[i];
          return a ? `Q: ${q.text} → ${a.substring(0, 150)}` : `Q: ${q.text}`;
        });
      rufusContext = `ALEXA FOR SHOPPING SHOPPER QUESTIONS (mirror these intents — shoppers ask Alexa for Shopping the same things):\n${pairs.join("\n")}`;
    }

    // COSMO: high-confidence triples
    const cosmo = cosmoRow[0];
    if (cosmo?.triples?.length) {
      const high = (cosmo.triples as Array<{ entity1: string; relationship: string; entity2: string; confidence_level: string; confidence: number }>)
        .filter((t) => t.confidence_level === "High" || t.confidence >= 0.8)
        .slice(0, 12);
      if (high.length) {
        cosmoContext = `COSMO RELATIONSHIPS (reinforce these associations in answers):\n${high.map((t) => `- ${t.entity1} ${t.relationship} ${t.entity2}`).join("\n")}`;
      }
    }
  }

  const contextBlocks = rows.map((r: any) => buildContext(r, reviewsByAsin)).join("\n\n---\n\n");

  const userPrompt = `Generate 5 Decision-stage Premium A+ Q&A pairs for each ASIN below.

Brand: ${brandName}
T1 Keywords: ${kwList}
${guidelines ? `Brand guidelines: ${guidelines}` : ""}
${rufusContext ? `\n${rufusContext}` : ""}
${cosmoContext ? `\n${cosmoContext}` : ""}

APPROVED CONTENT (per ASIN — includes customer themes and objections):
${contextBlocks}

Return ONLY a valid JSON array as specified.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        max_tokens: Math.min(aiConfig.maxTokens, 8192),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}`);
    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const arrStart = cleaned.indexOf("[");
    if (arrStart === -1) throw new Error("No JSON array in response");

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
    if (arrEnd === -1) throw new Error("Incomplete JSON array");

    const pairs: AsinQA[] = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));

    const annotated = pairs.map((item) => ({
      ...item,
      questions: (item.questions || []).map((pair) => ({
        ...pair,
        qLen: (pair.q || "").length,
        aLen: (pair.a || "").length,
      })),
    }));

    return NextResponse.json({ pairs: annotated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to generate Q&A";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
