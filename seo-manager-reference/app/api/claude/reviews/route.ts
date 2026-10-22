/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S3 Review Analysis API — Claude AI (raw fetch, no SDK)
// POST /api/claude/reviews
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are the Review Intelligence Engine for Amazon SEO.

Analyze each review. Return structured intelligence.

FOR EACH REVIEW determine:
- s: Sentiment (Positive+ | Positive | Neutral | Negative | Negative-)
- th: Key themes comma-separated
- u: Usage mentioned (Ritual, Habitual, Occasional, Emergency, or context)
- pkg: Packaging feedback or "None mentioned"
- pr: Price feedback or "None mentioned"
- hl: Heat/intensity feedback or "Not applicable"
- ri: Rufus buyer-psychology insight from review language
- bm: Bullet mapping (e.g. "Bullet 1: Effectiveness")

RULES:
- Anonymize names as Reviewer_001, Reviewer_002, etc.
- No blank fields — use "None mentioned" or "Not applicable"

OUTPUT: ONLY a JSON array with short keys:
{"id":"...","d":"YYYY-MM-DD","rn":"Reviewer_XXX","v":"...","r":5,"t":"title","s":"Positive","th":"...","u":"...","pkg":"...","pr":"...","hl":"...","ri":"...","bm":"..."}

No markdown, no code fences, no explanation. Start with [ end with ].`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

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

    console.log(`Reviews: ${count} reviews, prompt ~${userPrompt.length} chars`);
    const startTime = Date.now();

    // Use raw fetch — no SDK overhead, faster cold start
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Anthropic API ${response.status}:`, errText);
      return NextResponse.json({ error: `Anthropic API error ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    console.log(`Reviews: responded in ${Date.now() - startTime}ms, stop: ${data.stop_reason}`);

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

    return NextResponse.json({
      reviews: expanded,
      totalProcessed: expanded.length,
      usage,
    });
  } catch (err: any) {
    console.error("Reviews API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to analyze reviews" },
      { status: 500 }
    );
  }
}
