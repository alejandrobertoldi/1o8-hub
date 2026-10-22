/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S3 Review Analysis API — Claude AI (raw fetch, no SDK)
// POST /api/claude/reviews
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { getConfigDocBlock } from "@/lib/seo-config-doc";
import { getAuthSession } from "@/lib/auth-db";
import { logEvent } from "@/lib/event-logger";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 300;

const SYSTEM_PROMPT = `You are the Review Intelligence Engine for Amazon SEO.

Analyze each review. Return structured intelligence.

FOR EACH REVIEW determine:
- s: Sentiment (Positive+ | Positive | Neutral | Negative | Negative-)
- th: Key themes comma-separated
- u: Usage mentioned (Ritual, Habitual, Occasional, Emergency, or context)
- pkg: Packaging feedback or "None mentioned"
- pr: Price feedback or "None mentioned"
- hl: Heat/intensity feedback or "Not applicable"
- ri: Alexa for Shopping buyer-psychology insight from review language
- bm: Bullet mapping (e.g. "Bullet 1: Effectiveness")

RULES:
- Anonymize names as Reviewer_001, Reviewer_002, etc.
- No blank fields — use "None mentioned" or "Not applicable"

OUTPUT: ONLY a JSON array with short keys:
{"id":"...","d":"YYYY-MM-DD","rn":"Reviewer_XXX","v":"...","r":5,"t":"title","s":"Positive","th":"...","u":"...","pkg":"...","pr":"...","hl":"...","ri":"...","bm":"..."}

No markdown, no code fences, no explanation. Start with [ end with ].`;

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

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

    const aiConfig = await getAiFeatureConfig("seo_reviews");
    if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

    const body = await req.json();
    const { reviewBlock, reviewCount, brandName, productName } = body;

    // Support both new (pre-trimmed) and legacy (full reviews) format
    let prompt: string;
    let count: number;

    if (reviewBlock) {
      prompt = reviewBlock;
      count = reviewCount || 0;
    } else if (body.reviews && Array.isArray(body.reviews)) {
      const reviews = body.reviews.slice(0, 60);
      count = reviews.length;
      prompt = reviews
        .map((r: any, i: number) =>
          `[${i + 1}] ${r.star_rating}★ | ${r.product_variation || "—"} | ${r.date_iso || ""} | HV:${r.helpful_votes || 0}\n${r.title}\n${(r.text || "").substring(0, 250)}`)
        .join("\n---\n");
    } else {
      return NextResponse.json({ error: "No reviews provided" }, { status: 400 });
    }

    const userPrompt = `Product: ${brandName || "Product"} — ${productName || ""}
${count} reviews:

${prompt}

Analyze ALL ${count} reviews. Return JSON array with short keys.`;

    const startTime = Date.now();

    const configBlock = await getConfigDocBlock(2000);
    const finalSystemPrompt = configBlock ? `${configBlock}\n\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;

    // Use raw fetch — no SDK overhead, faster cold start
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        max_tokens: aiConfig.maxTokens,
        system: finalSystemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Anthropic API ${response.status}:`, errText);
      return NextResponse.json({ error: `Anthropic API error ${response.status}` }, { status: 502 });
    }

    const data = await response.json();

    const usage = data.usage || { input_tokens: 0, output_tokens: 0 };

    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
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
          console.error(`Reviews JSON parse failed. Raw: ${clean.substring(0, 300)}`);
          return NextResponse.json({ error: "AI response was malformed. Try again." }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: "AI returned empty response. Try again." }, { status: 500 });
      }
    }

    // Expand short keys
    const expanded = parsed.map((kw: any) => ({
      ReviewID: kw.id || kw.ReviewID || "",
      ReviewDate: kw.d || kw.ReviewDate || "",
      ReviewReviewerName: kw.rn || kw.ReviewReviewerName || "",
      ReviewASIN: "ParentASIN",
      ReviewProductVariation: kw.v || kw.ReviewProductVariation || "",
      ReviewStarRating: kw.r || kw.ReviewStarRating || 0,
      ReviewTitle: kw.t || kw.ReviewTitle || "",
      ReviewSentiment: kw.s || kw.ReviewSentiment || "Neutral",
      ReviewKeyThemes: kw.th || kw.ReviewKeyThemes || "",
      ReviewUsageMentioned: kw.u || kw.ReviewUsageMentioned || "Not analyzed",
      ReviewPackagingFeedback: kw.pkg || kw.ReviewPackagingFeedback || "None mentioned",
      ReviewPriceFeedback: kw.pr || kw.ReviewPriceFeedback || "None mentioned",
      ReviewHeatLevelFeedback: kw.hl || kw.ReviewHeatLevelFeedback || "Not applicable",
      ReviewRufusUsableInsight: kw.ri || kw.ReviewRufusUsableInsight || "Not analyzed",
      ReviewBulletMapping: kw.bm || kw.ReviewBulletMapping || "Not analyzed",
    }));

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:reviews",
      status: "success",
      resourceLabel: brandName || productName,
      message: `Analyzed ${expanded.length} reviews`,
      detail: { reviewsIn: count, reviewsOut: expanded.length, usage },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({
      reviews: expanded,
      totalProcessed: expanded.length,
      usage,
    });
  } catch (err: unknown) {
    console.error("Reviews API error:", err);
    const errMsg = err instanceof Error ? err.message : "Failed to analyze reviews";

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:reviews",
      status: "error",
      message: errMsg,
      detail: { error: errMsg },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(
      { error: errMsg },
      { status: 500 }
    );
  }
}
