/* eslint-disable react-doctor/server-fetch-without-revalidate */
/* eslint-disable react-doctor/js-combine-iterations */
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { batch, brandName, asins, keywords, cosmo, rufus, reviews, guidelines, sizePlacement, currentRows, feedback } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  const tier1 = keywords.filter((k: any) => k.KeywordPriorityTier === "T1").slice(0, 20);
  const tier2 = keywords.filter((k: any) => k.KeywordPriorityTier === "T2").slice(0, 20);
  const tier3 = keywords.filter((k: any) => k.KeywordPriorityTier === "T3").slice(0, 15);
  const tier4 = keywords.filter((k: any) => k.KeywordPriorityTier === "T4").slice(0, 30);

  const asinList = asins.map((a: any) => ({
    asin: a.asin, parentage_level: a.parentage_level, variation_product: a.variation_product,
    variation_theme_name: a.variation_theme_name, flavor: a.flavor, style: a.style,
    color: a.color, size: a.size, existing_title: a.existing_content?.item_name || "",
  }));

  const complianceRules = `
COMPLIANCE (ABSOLUTE):
- NO medical/disease/treatment/cure/guarantee claims
- NO competitor names in content
- NO emoji or non-ASCII characters
- NO colons ":" in titles or descriptions (ONLY in bullet ALL CAPS headers)
- Titles: hyphen "-" only separator, one space each side
- No word >2x per title (case-insensitive)
- Keyword phrase max 1x per element
- Content must read human-written. Quality > keyword density.
${guidelines ? `\nBRAND GUIDELINES (LOCKED):\n${guidelines}\n` : ""}`;

  let systemPrompt = "";
  let userPrompt = "";

  switch (batch) {
    // ════════════════════════════════════════════════════════
    // BATCH 1: TITLES
    // ════════════════════════════════════════════════════════
    case "titles": {
      systemPrompt = `You are the Amazon Listing Title Generator for 1o8 SEO Manager.
${complianceRules}

TITLE RULES:
- One title per ASIN. Length: 190-200 characters exact.
- Only chars: letters, numbers, spaces, hyphen "-"
- Hyphen: one space before and after each "-"
- First segment: Brand Name + core product noun phrase
- Variation attributes NEVER in first segment
- Parent ASIN: Size="Parent" in data but do NOT put "Parent" in the title text
${sizePlacement ? `- Size placement: ${sizePlacement === "end" ? "end of title" : sizePlacement === "after-brand" ? "after brand name" : "after product descriptor"}` : ""}
- Tier 1 keywords naturally where they fit
- No filler phrases

OUTPUT FORMAT: Return a JSON array. Each object = one ASIN with these exact keys:
{ "ASIN": "...", "Title": "...", "Title_CharLength": <number> }
Title_CharLength must be the exact character count of Title.`;

      userPrompt = `Generate titles for these ASINs.

Brand: ${brandName}
ASINs:\n${JSON.stringify(asinList, null, 1)}

Tier 1 Keywords:\n${tier1.map((k: any) => `- ${k.KeywordText} (SV: ${k.SearchVolume})`).join("\n")}

COSMO:\n${cosmo.slice(0, 10).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue}`).join("\n")}
${feedback ? `\nREVISION FEEDBACK: ${feedback}` : ""}

Return ONLY valid JSON array.`;
      break;
    }

    // ════════════════════════════════════════════════════════
    // BATCH 2: BULLETS
    // ════════════════════════════════════════════════════════
    case "bullets": {
      systemPrompt = `You are the Amazon Bullet Point Generator for 1o8 SEO Manager.
${complianceRules}

BULLET RULES:
- 5 bullets per ASIN in 4 versions
- Detailed: 390-400 chars. Concise: 190-200 chars. Content: 90-100 chars. Key Features: 40-50 chars.
- Every bullet: ALL CAPS summary + colon, then normal case
- B1-B2: Consideration stage. B3-B5: Decision stage.
- B5: variation-specific for Child ASINs
- Min 1 keyword/bullet. Max 1x per keyword phrase per bullet.
- No word >2x per bullet. No cross-bullet duplication.
- Bullet purposes: B1=core value, B2=fit/scope, B3=workflow/instruction, B4=care/durability, B5=variation-specific

OUTPUT FORMAT: Return a JSON array. Each object = one ASIN with these exact keys:
{
  "ASIN": "...",
  "DetailedBulletPoint_1": "...", "DetailedBulletPoint_1_CharLength": <n>,
  "DetailedBulletPoint_2": "...", "DetailedBulletPoint_2_CharLength": <n>,
  "DetailedBulletPoint_3": "...", "DetailedBulletPoint_3_CharLength": <n>,
  "DetailedBulletPoint_4": "...", "DetailedBulletPoint_4_CharLength": <n>,
  "DetailedBulletPoint_5": "...", "DetailedBulletPoint_5_CharLength": <n>,
  "ConciseBulletPoint_1": "...", "ConciseBulletPoint_1_CharLength": <n>,
  "ConciseBulletPoint_2": "...", "ConciseBulletPoint_2_CharLength": <n>,
  "ConciseBulletPoint_3": "...", "ConciseBulletPoint_3_CharLength": <n>,
  "ConciseBulletPoint_4": "...", "ConciseBulletPoint_4_CharLength": <n>,
  "ConciseBulletPoint_5": "...", "ConciseBulletPoint_5_CharLength": <n>,
  "ContentBulletPoint_1": "...", "ContentBulletPoint_1_CharLength": <n>,
  "ContentBulletPoint_2": "...", "ContentBulletPoint_2_CharLength": <n>,
  "ContentBulletPoint_3": "...", "ContentBulletPoint_3_CharLength": <n>,
  "ContentBulletPoint_4": "...", "ContentBulletPoint_4_CharLength": <n>,
  "ContentBulletPoint_5": "...", "ContentBulletPoint_5_CharLength": <n>,
  "KeyFeaturesBulletPoint_1": "...", "KeyFeaturesBulletPoint_1_CharLength": <n>,
  "KeyFeaturesBulletPoint_2": "...", "KeyFeaturesBulletPoint_2_CharLength": <n>,
  "KeyFeaturesBulletPoint_3": "...", "KeyFeaturesBulletPoint_3_CharLength": <n>,
  "KeyFeaturesBulletPoint_4": "...", "KeyFeaturesBulletPoint_4_CharLength": <n>,
  "KeyFeaturesBulletPoint_5": "...", "KeyFeaturesBulletPoint_5_CharLength": <n>
}
All CharLength values must be exact character counts.`;

      const approvedTitles = (currentRows || []).map((r: any) => `${r.ASIN}: ${r.Title}`).filter((s: string) => s.includes(": ")).join("\n");

      userPrompt = `Generate all bullet points.

Brand: ${brandName}
ASINs:\n${JSON.stringify(asinList, null, 1)}

Tier 1:\n${tier1.map((k: any) => `- ${k.KeywordText}`).join("\n")}
Tier 2:\n${tier2.map((k: any) => `- ${k.KeywordText}`).join("\n")}

Rufus:\n${rufus.slice(0, 8).map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 150)}`).join("\n\n")}

COSMO:\n${cosmo.slice(0, 12).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue}`).join("\n")}

Reviews:\n${reviews.slice(0, 8).map((r: any) => `${r.ReviewTheme}: ${r.ReviewRufusUsableInsight || ""}`).join("\n")}

Approved Titles:\n${approvedTitles}
${feedback ? `\nREVISION FEEDBACK: ${feedback}` : ""}

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
{ "ASIN": "...", "ProductDescription": "...", "ProductDescription_CharLength": <n> }`;

      const titlesCtx = (currentRows || []).map((r: any) => `${r.ASIN}: ${r.Title}`).filter((s: string) => s.includes(": ")).join("\n");
      const bulletsCtx = (currentRows || []).map((r: any) => `${r.ASIN} B1: ${(r.DetailedBulletPoint_1 || "").substring(0, 80)}...`).filter((s: string) => !s.endsWith(": ...")).join("\n");

      userPrompt = `Generate product descriptions.

Brand: ${brandName}
ASINs:\n${JSON.stringify(asinList, null, 1)}

Titles:\n${titlesCtx}

Bullet summaries:\n${bulletsCtx}

COSMO:\n${cosmo.slice(0, 10).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue}`).join("\n")}

Rufus:\n${rufus.slice(0, 5).map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 120)}`).join("\n\n")}
${feedback ? `\nREVISION FEEDBACK: ${feedback}` : ""}

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
- 5 sets per ASIN: Core, Supplement, Symptom, Audience, LongTail
- Each: 220-250 bytes. ONLY Tier 4 keywords. Lowercase. No punctuation. Space-separated.
- No brand name. No competitor names. No prohibited terms. No repetition across sets.

OUTPUT FORMAT: Return a JSON array:
{
  "ASIN": "...",
  "SearchTermsCore": "...", "SearchTermsCore_ByteLength": <n>,
  "SearchTermsSupplement": "...", "SearchTermsSupplement_ByteLength": <n>,
  "SearchTermsSymptom": "...", "SearchTermsSymptom_ByteLength": <n>,
  "SearchTermsAudience": "...", "SearchTermsAudience_ByteLength": <n>,
  "SearchTermsLongTail": "...", "SearchTermsLongTail_ByteLength": <n>
}
ByteLength = byte count of each string (UTF-8).`;

      const usedKws = tier1.concat(tier2).map((k: any) => k.KeywordText).join(", ");

      userPrompt = `Generate backend search terms.

ASINs: ${asinList.map((a: any) => `${a.asin} (${a.parentage_level})`).join(", ")}

Tier 4 keywords (USE THESE):\n${tier4.map((k: any) => k.KeywordText).join(", ")}

Tier 3 (gap fill if needed):\n${tier3.map((k: any) => k.KeywordText).join(", ")}

Already used in surface content (DO NOT repeat):\n${usedKws}
${feedback ? `\nREVISION FEEDBACK: ${feedback}` : ""}

Return ONLY valid JSON array.`;
      break;
    }

    default:
      return NextResponse.json({ error: `Unknown batch: ${batch}` }, { status: 400 });
  }

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
        max_tokens: 8192,
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

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in Claude response");

    const rows = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ rows, usage: claudeData.usage });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
