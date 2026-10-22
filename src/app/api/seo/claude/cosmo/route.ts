/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S5 COSMO API — Claude AI
// POST /api/claude/cosmo
// Action: generate
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getConfigDocBlock } from "@/lib/seo-config-doc";
import { getAuthSession } from "@/lib/auth-db";
import { logEvent } from "@/lib/event-logger";
import { getAiFeatureConfig } from "@/lib/ai-config.server";

export const maxDuration = 300;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { action } = body;

    const aiConfig = await getAiFeatureConfig("seo_cosmo");
    if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

    if (action === "generate") {
      return handleGenerate(body, session, startTime, aiConfig);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err: unknown) {
    console.error("COSMO API error:", err);
    const errMsg = err instanceof Error ? err.message : "Failed";
    const errStatus = err instanceof Anthropic.APIError ? err.status : undefined;

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:cosmo",
      status: "error",
      message: errMsg,
      detail: { error: errMsg },
      durationMs: Date.now() - startTime,
    });

    const status = errStatus === 404 ? 500 : errStatus === 429 ? 429 : 500;
    const msg = errMsg.includes("ANTHROPIC_API_KEY") ? "Anthropic API key is not configured."
      : errStatus === 404 || errMsg.includes("not_found") ? "Invalid AI model configured. Check SEO Config."
      : errStatus === 429 ? "Rate limit reached. Try again shortly."
      : "COSMO generation failed. Check server logs.";
    return NextResponse.json({ error: msg }, { status });
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

async function handleGenerate(body: any, session: any, startTime: number, aiConfig: { model: string; maxTokens: number }) {
  // Body now contains pre-trimmed data from the client
  const { brandName, parentAsin, asinList, topKeywords, reviewThemes, rufusInsights, guidelines } = body;

  const systemPrompt = `You are the COSMO Semantic Modeling Engine for 1o8 SEO.

Your task: Generate a complete COSMO semantic entity-relationship map for an Amazon product listing.

COSMO RELATIONSHIP TYPES (use only these, grouped by category):
Functional/Usage: USED_FOR_FUNC, USED_TO, CAPABLE_OF
Event/Context: USED_FOR_EVE, USED_ON, USED_IN_LOC
Product/Concept: USED_AS, IS_A, xIS_A
Body/Interaction: USED_IN_BODY
Complementary: USED_WITH
Audience/User: USED_FOR_AUD, USED_BY
Interest/Motivation: xINTERESTED_IN, xWANT

Category guidance:
- USED_FOR_FUNC: Core function or practical use of the product
- USED_TO: Intended purpose or outcome the product supports
- CAPABLE_OF: What the product can enable based on its features
- USED_FOR_EVE: Events or activities where the product is used
- USED_ON: Time-based, seasonal, or situational relevance
- USED_IN_LOC: Physical locations or environments
- USED_AS: Functional or conceptual role of the product
- IS_A: Primary taxonomic classification
- xIS_A: Audience- or context-specific classifications for category clarity
- USED_IN_BODY: Body interaction (fully compliant, non-medical language only)
- USED_WITH: Products or items commonly used alongside
- USED_FOR_AUD: Intended audience
- USED_BY: Common user type or demographic
- xINTERESTED_IN: Interests, preferences, or thematic categories tied to the user
- xWANT: Goals, desires, or activities the user seeks to accomplish

PDP SECTION MAPPING (for COSMOAppliedPDPSection1 and COSMOAppliedPDPSection2):
- Title, Bullet 1, Bullet 2, Bullet 3, Bullet 4, Bullet 5, Description, Backend, A+ Module, Image, Not Applicable

RULES:
1. Generate exactly 20 relationship rows — no more, no less.
2. Prioritize variety across ALL relationship types — aim for at least one of each applicable type.
3. Every row must trace to a keyword, review insight, or Alexa for Shopping answer.
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

=== ALEXA FOR SHOPPING INSIGHTS (S4) ===
${rufusInsights || "None provided"}

Generate exactly 20 COSMO rows as a valid JSON array. Output ONLY the JSON array.`;

  const configBlock = await getConfigDocBlock(4000);
  const finalSystemPrompt = configBlock ? `${configBlock}\n\n${systemPrompt}` : systemPrompt;

  const response = await getAnthropicClient().messages.create({
    model: aiConfig.model,
    max_tokens: aiConfig.maxTokens,
    system: finalSystemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  // Try clean parse first
  try {
    const rows = JSON.parse(clean);

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:cosmo",
      status: "success",
      resourceLabel: brandName,
      message: `Generated ${rows.length} COSMO rows`,
      detail: { rowsOut: rows.length, usage: response.usage },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ rows, usage: response.usage });
  } catch {
    // Try to repair truncated JSON
    const repaired = repairTruncatedJson(clean);
    if (repaired && repaired.length > 0) {
      console.warn(`COSMO: repaired truncated JSON, recovered ${repaired.length} rows`);

      logEvent({
        userEmail: session?.user?.email,
        userName: session?.user?.name,
        section: "seo",
        action: "claude:cosmo",
        status: "warning",
        resourceLabel: brandName,
        message: `Repaired truncated JSON, recovered ${repaired.length} rows`,
        detail: { rowsOut: repaired.length, stopReason: response.stop_reason, usage: response.usage },
        durationMs: Date.now() - startTime,
      });

      return NextResponse.json({ rows: repaired, usage: response.usage, repaired: true });
    }

    const errMsg = `COSMO generation failed: ${response.stop_reason === "max_tokens" ? "Response too long — try again with fewer keywords loaded" : "Invalid JSON from AI"}`;

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:cosmo",
      status: "error",
      resourceLabel: brandName,
      message: errMsg,
      detail: { stopReason: response.stop_reason, rawStart: clean.substring(0, 200), usage: response.usage },
      durationMs: Date.now() - startTime,
    });

    console.error("COSMO parse failed. stop_reason:", response.stop_reason, "| Raw start:", clean.substring(0, 200));
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
