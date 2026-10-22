/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S5 COSMO API — Claude AI
// POST /api/claude/cosmo
// Action: generate
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  fetch: fetch,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate") {
      return handleGenerate(body);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("COSMO API error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}

/** Attempt to salvage a truncated JSON array by closing it */
function repairTruncatedJson(raw: string): any[] | null {
  let text = raw.trim();
  if (!text.startsWith("[")) return null;

  // Already valid?
  try { return JSON.parse(text); } catch {}

  // Strip trailing partial object — find last complete }, or }
  const lastComplete = Math.max(text.lastIndexOf("},"), text.lastIndexOf("}\n"));
  if (lastComplete > 0) {
    const candidate = text.slice(0, lastComplete + 1) + "]";
    try { return JSON.parse(candidate); } catch {}
  }

  // Last resort: close the array
  const closed = text.replace(/,?\s*$/, "") + "]";
  try { return JSON.parse(closed); } catch {}

  return null;
}

async function handleGenerate(body: any) {
  // Body now contains pre-trimmed data from the client
  const { brandName, parentAsin, asinList, topKeywords, reviewThemes, rufusInsights, guidelines } = body;

  const systemPrompt = `You are the COSMO Semantic Modeling Engine for 1o8 Marketplace SEO.

Your task: Generate a complete COSMO semantic entity-relationship map for an Amazon product listing.

COSMO RELATIONSHIP TYPES (use only these):
- IS_A: Product classification/category
- HAS_A: Product attributes/features
- USED_FOR: Primary use cases
- USED_FOR_AUD: Target audience segments
- MADE_OF: Ingredients/materials
- SOLD_AS: Packaging/format/variants
- COMPARED_TO: Competitive positioning (internal only, no competitor names)
- INTERESTED_IN: User interests/lifestyle
- AVAILABLE_IN: Sizes/flavors/colors/variants
- USED_WITH: Complementary products
- USED_BY: User demographics
- xINTERESTED_IN: Extended interest categories
- xWANT: User goals/desires

PDP SECTION MAPPING (for COSMOAppliedPDPSection1 and COSMOAppliedPDPSection2):
- Title, Bullet 1, Bullet 2, Bullet 3, Bullet 4, Bullet 5, Description, Backend, A+ Module, Image, Not Applicable

RULES:
1. Generate exactly 20 relationship rows — no more, no less.
2. Prioritize variety across ALL relationship types — aim for at least one of each applicable type.
3. Every row must trace to a keyword, review insight, or Rufus answer.
4. COSMOEntity = the product or product attribute being mapped.
5. COSMOTailType = the target concept (audience, use case, ingredient, etc.)
6. COSMOMappedValue = the specific value — keep concise.
7. COSMOUsageExplanation = how this relationship informs listing content — max 20 words.
8. COSMOAppliedPDPSection1 = primary PDP location.
9. COSMOAppliedPDPSection2 = secondary PDP location (use "Not Applicable" if none).
10. COSMONotes = source reference — max 10 words.
11. No cell may be blank — use "Not Applicable" where needed.
12. NEVER include competitor names in any field.
13. No medical/disease claims.

OUTPUT: Return ONLY a valid JSON array — no markdown, no code fences, no preamble, no explanation.
Start with [ and end with ].

JSON schema for each object:
{"ASIN":"","COSMOEntity":"","COSMORelationType":"","COSMOTailType":"","COSMOMappedValue":"","COSMOUsageExplanation":"","COSMOAppliedPDPSection1":"","COSMOAppliedPDPSection2":"","COSMONotes":""}`;

  const guidelinesBlock = guidelines
    ? `\n=== BRAND GUIDELINES ===\n${String(guidelines).substring(0, 600)}\n=== END GUIDELINES ===\n`
    : "";

  const userPrompt = `Product: ${brandName}
Parent ASIN: ${parentAsin}
ASINs in scope: ${asinList || ""}
${guidelinesBlock}
=== TOP KEYWORDS (S2) ===
${topKeywords || "None provided"}

=== REVIEW THEMES (S3) ===
${reviewThemes || "None provided"}

=== RUFUS INSIGHTS (S4) ===
${rufusInsights || "None provided"}

Generate exactly 20 COSMO rows as a valid JSON array. Output ONLY the JSON array.`;

  console.log("COSMO: Calling Claude Haiku, prompt length:", userPrompt.length);
  const startTime = Date.now();

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  console.log("COSMO: Claude responded in", Date.now() - startTime, "ms, stop_reason:", response.stop_reason);

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Try clean parse first
  try {
    const rows = JSON.parse(clean);
    return NextResponse.json({ rows, usage: response.usage });
  } catch {
    // Try to repair truncated JSON
    const repaired = repairTruncatedJson(clean);
    if (repaired && repaired.length > 0) {
      console.warn(`COSMO: repaired truncated JSON, recovered ${repaired.length} rows`);
      return NextResponse.json({ rows: repaired, usage: response.usage, repaired: true });
    }

    console.error("COSMO parse failed. stop_reason:", response.stop_reason, "| Raw start:", clean.substring(0, 200));
    return NextResponse.json(
      { error: `COSMO generation failed: ${response.stop_reason === "max_tokens" ? "Response too long — try again with fewer keywords loaded" : "Invalid JSON from AI"}` },
      { status: 500 }
    );
  }
}
