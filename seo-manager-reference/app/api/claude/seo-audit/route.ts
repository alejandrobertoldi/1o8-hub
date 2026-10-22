/* eslint-disable react-doctor/server-fetch-without-revalidate */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { brandName, rows, keywords, cosmo, rufus, reviews, guidelines } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  // Build summary of generated content
  const contentSummary = rows.map((r: any) => {
    return `ASIN: ${r.ASIN} (${r.ParentageLevel})
Title: ${r.Title || "[empty]"}
DetailedB1: ${(r.DetailedBulletPoint_1 || "").substring(0, 120)}...
DetailedB2: ${(r.DetailedBulletPoint_2 || "").substring(0, 120)}...
DetailedB3: ${(r.DetailedBulletPoint_3 || "").substring(0, 120)}...
DetailedB4: ${(r.DetailedBulletPoint_4 || "").substring(0, 120)}...
DetailedB5: ${(r.DetailedBulletPoint_5 || "").substring(0, 120)}...
Description: ${(r.ProductDescription || "").substring(0, 200)}...
Backend Core: ${(r.SearchTermsCore || "").substring(0, 100)}...`;
  }).join("\n\n");

  // Keyword tier breakdown
  const tier1 = keywords.filter((k: any) => k.KeywordPriorityTier === "T1").slice(0, 15);
  const tier2 = keywords.filter((k: any) => k.KeywordPriorityTier === "T2").slice(0, 15);

  const systemPrompt = `You are the 1o8 SEO Audit Engine. You analyze generated Amazon listing content against the research data from Sections 1-5 to identify gaps, missed opportunities, and areas for improvement BEFORE the content is locked.

Your audit must cover:
1. COMPLIANCE CHECK: Scan for prohibited terms, medical claims, competitor names, emoji, colon misuse
2. KEYWORD COVERAGE: Check how many Tier 1 and Tier 2 keywords appear in titles, bullets, description
3. COSMO DENSITY: Do the listings express COSMO relationships (IS_A, HAS_FEATURE, USED_FOR, etc.)?
4. RUFUS COVERAGE: Are the 5 Rufus questions answered somewhere in the content?
5. HUMAN VOICE: Does content read naturally or feel keyword-stuffed/templated?
6. BUYER JOURNEY: Title=Decision, B1-B2=Consideration, B3-B5=Decision, Desc=Awareness→Consideration?
7. VARIATION CONSISTENCY: Are Child ASINs differentiated appropriately?

Score each category 0-100. Also compute an overall score (weighted average).

Find specific, actionable improvement opportunities. For each finding include:
- severity: "critical" | "warning" | "info"
- category: which audit area
- detail: what was found
- suggestion: specific fix

OUTPUT: Return ONLY valid JSON:
{
  "complianceScore": <0-100>,
  "keywordCoverage": <0-100>,
  "cosmoDensity": <0-100>,
  "rufusCoverage": <0-100>,
  "humanVoice": <0-100>,
  "buyerJourney": <0-100>,
  "variationConsistency": <0-100>,
  "overallScore": <0-100>,
  "findings": [
    { "severity": "...", "category": "...", "detail": "...", "suggestion": "..." }
  ]
}`;

  const userPrompt = `Audit this generated content against the research data.

BRAND: ${brandName}
${guidelines ? `BRAND GUIDELINES: ${guidelines.substring(0, 500)}` : ""}

═══ GENERATED CONTENT ═══
${contentSummary}

═══ RESEARCH DATA ═══

TIER 1 KEYWORDS (must appear in surface content):
${tier1.map((k: any) => `- "${k.KeywordText}" SV:${k.SearchVolume}`).join("\n")}

TIER 2 KEYWORDS (should appear where natural):
${tier2.map((k: any) => `- "${k.KeywordText}" SV:${k.SearchVolume}`).join("\n")}

COSMO RELATIONSHIPS (should be expressed in content):
${cosmo.slice(0, 15).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue} → PDP: ${c.COSMOAppliedPDPSection1}`).join("\n")}

RUFUS QUESTIONS (should be answered in listing):
${rufus.slice(0, 5).map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 150)}`).join("\n\n")}

REVIEW THEMES (should be addressed):
${reviews.slice(0, 10).map((r: any) => `${r.ReviewTheme || "Theme"}: ${(r.ReviewRufusUsableInsight || "").substring(0, 100)}`).join("\n")}

Return ONLY valid JSON.`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in audit response");

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
