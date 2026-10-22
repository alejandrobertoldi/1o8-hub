/* eslint-disable react-doctor/js-index-maps */
/* eslint-disable react-doctor/server-fetch-without-revalidate */
import { NextRequest, NextResponse } from "next/server";
import { getConfigDocBlock } from "@/lib/seo-config-doc";
import { getAuthSession } from "@/lib/auth-db";
import { logEvent } from "@/lib/event-logger";
import { getAiFeatureConfig } from "@/lib/ai-config.server";

export const maxDuration = 300;

/** Extract a balanced JSON object from a string that may contain markdown fences */
function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const objStart = cleaned.indexOf("{");
  if (objStart === -1) throw new Error("No JSON in response");
  let depth = 0;
  let objEnd = -1;
  let inString = false;
  let escape = false;
  for (let i = objStart; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { objEnd = i; break; } }
  }
  if (objEnd === -1) throw new Error("No complete JSON object in response");
  return JSON.parse(cleaned.slice(objStart, objEnd + 1));
}

/** Extract a balanced JSON array from a string */
function extractJsonArray(raw: string): unknown[] {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const arrStart = cleaned.indexOf("[");
  if (arrStart === -1) throw new Error("No JSON array in response");
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
  if (arrEnd === -1) throw new Error("No complete JSON array in response");
  return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
}

/** Call Claude API */
async function callClaude(
  apiKey: string,
  model: string,
  maxTokens: number,
  system: string,
  user: string,
): Promise<{ text: string; usage: unknown }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return { text: data.content?.[0]?.text || "", usage: data.usage };
}

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  const startTime = Date.now();

  const body = await req.json();
  const { brandName, rows, keywords, cosmo, rufus, reviews, guidelines } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  const aiConfig = await getAiFeatureConfig("seo_audit");
  if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

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
Backend: ${(r.BackendSearchTerms || "").substring(0, 200)}...`;
  }).join("\n\n");

  // Keyword tier breakdown
  const tier1 = keywords.filter((k: any) => k.KeywordPriorityTier === "T1").slice(0, 15);
  const tier2 = keywords.filter((k: any) => k.KeywordPriorityTier === "T2").slice(0, 15);

  // ═══════════════════════════════════════════════════════════════
  // CALL 1: Score 12 categories + findings
  // ═══════════════════════════════════════════════════════════════

  const scoreSystemPrompt = `You are the 1o8 SEO Premium Audit Engine. You analyze generated Amazon listing content against research data to score quality and identify specific improvement opportunities.

Your audit covers 12 dimensions:
1. COMPLIANCE: Prohibited terms, medical claims, competitor names, emoji, colon misuse
2. KEYWORD COVERAGE: Tier 1 and Tier 2 keyword presence in titles, bullets, description
3. COSMO DENSITY: COSMO relationship expression (USED_FOR_FUNC, USED_TO, CAPABLE_OF, IS_A, USED_FOR_AUD)
4. ALEXA FOR SHOPPING COVERAGE: Are Alexa for Shopping questions answered in the content?
5. HUMAN VOICE: Natural readability vs keyword-stuffed/templated feel
6. BUYER JOURNEY: Title=Decision, B1-B2=Consideration, B3-B5=Decision, Desc=Awareness→Consideration
7. VARIATION CONSISTENCY: Child ASIN differentiation
8. E-E-A-T SIGNALS: Experience, Expertise, Authority, Trust — claims backed by evidence, knowledgeable voice
9. READABILITY: Flesch-Kincaid grade 8-10, scannable bullets, well-structured description
10. AI CITABILITY: Can AI assistants (Alexa for Shopping, AI Overviews, ChatGPT) excerpt clean quotable passages? Clear Q&A structures?
11. GEO READINESS: Brand mention signals, passage citability for AI search, entity clarity, implicit Q&A structure for AI-powered discovery (Amazon Alexa for Shopping, Google AI Overviews, Perplexity, ChatGPT web search)
12. OVERALL: Weighted average of all dimensions

For each finding, be SPECIFIC — include which ASIN and which field (Title, DetailedBulletPoint_1-5, ProductDescription, BackendSearchTerms) is affected.

OUTPUT: Return ONLY valid JSON:
{
  "complianceScore": <0-100>,
  "keywordCoverage": <0-100>,
  "cosmoDensity": <0-100>,
  "rufusCoverage": <0-100>,
  "humanVoice": <0-100>,
  "buyerJourney": <0-100>,
  "variationConsistency": <0-100>,
  "eeatScore": <0-100>,
  "readabilityScore": <0-100>,
  "citabilityScore": <0-100>,
  "geoScore": <0-100>,
  "overallScore": <0-100>,
  "findings": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "<audit dimension name>",
      "asin": "<specific ASIN or 'all'>",
      "field": "<Title|DetailedBulletPoint_1-5|ProductDescription|BackendSearchTerms|all>",
      "detail": "<what was found>",
      "suggestion": "<specific improvement instruction>",
      "batch": "titles" | "bullets" | "description" | "backend" | "all"
    }
  ],
  "remediation": {
    "titles": "<specific feedback for title regeneration or null>",
    "bullets": "<specific feedback for bullet regeneration or null>",
    "description": "<specific feedback for description regeneration or null>",
    "backend": "<specific feedback for backend regeneration or null>"
  }
}`;

  const scoreUserPrompt = `Audit this generated content against the research data.

BRAND: ${brandName}
${guidelines ? `BRAND GUIDELINES: ${guidelines}` : ""}

═══ GENERATED CONTENT ═══
${contentSummary}

═══ RESEARCH DATA ═══

TIER 1 KEYWORDS (must appear in surface content):
${tier1.map((k: any) => `- "${k.KeywordText}" SV:${k.SearchVolume}`).join("\n")}

TIER 2 KEYWORDS (should appear where natural):
${tier2.map((k: any) => `- "${k.KeywordText}" SV:${k.SearchVolume}`).join("\n")}

COSMO RELATIONSHIPS (should be expressed in content):
${cosmo.slice(0, 15).map((c: any) => `${c.COSMORelationType}: ${c.COSMOMappedValue} → PDP: ${c.COSMOAppliedPDPSection1}`).join("\n")}

ALEXA FOR SHOPPING QUESTIONS (should be answered in listing):
${rufus.slice(0, 5).map((r: any) => `Q: ${r.RufusQuestion}\nA: ${(r.RufusAnswer || "").substring(0, 150)}`).join("\n\n")}

REVIEW THEMES (should be addressed):
${reviews.slice(0, 10).map((r: any) => `${r.ReviewTheme || "Theme"}: ${(r.ReviewRufusUsableInsight || "").substring(0, 100)}`).join("\n")}

Return ONLY valid JSON.`;

  try {
    const configBlock = await getConfigDocBlock(4000);
    const finalScoreSystemPrompt = configBlock
      ? `${configBlock}\n\n${scoreSystemPrompt}`
      : scoreSystemPrompt;

    // Call 1: Score + findings
    const scoreResponse = await callClaude(
      apiKey,
      aiConfig.model,
      aiConfig.maxTokens,
      finalScoreSystemPrompt,
      scoreUserPrompt,
    );

    const result = extractJsonObject(scoreResponse.text) as any;

    // ═══════════════════════════════════════════════════════════════
    // CALL 2: Generate rewrite suggestions for warning+ findings
    // ═══════════════════════════════════════════════════════════════

    const rewritableFindings = (result.findings || []).filter(
      (f: any) => f.severity === "critical" || f.severity === "warning"
    );

    if (rewritableFindings.length > 0) {
      try {
        const rewriteSystemPrompt = `You are a premium Amazon listing copywriter. For each content finding below, write a specific replacement text that fixes the identified issue while maintaining compliance, keyword coverage, and natural voice.

Rules:
- Match the original field's character limits (Title: 190-200, Detailed bullets: 390-400, Description: 1000-1200, Backend: ≤500 bytes)
- Maintain ALL CAPS header + colon format for bullets
- No medical claims, competitor names, emoji, or colon in titles/descriptions
- Preserve existing keyword coverage while fixing the issue
- Write as if you're a product expert, not a copywriter

OUTPUT: Return ONLY a valid JSON array. Each object:
{ "index": <finding index 0-based>, "rewrite": "<the complete replacement text for the field>" }`;

        const findingsSummary = rewritableFindings.map((f: any, i: number) => {
          // Find the current text for this finding
          const row = rows.find((r: any) => r.ASIN === f.asin);
          const currentText = row ? (row[f.field] || "") : "";
          return `[${i}] ASIN: ${f.asin} | Field: ${f.field} | Issue: ${f.detail} | Suggestion: ${f.suggestion}
Current text: ${(currentText as string).substring(0, 300)}`;
        }).join("\n\n");

        const rewriteResponse = await callClaude(
          apiKey,
          aiConfig.model,
          Math.min(aiConfig.maxTokens, 8192),
          rewriteSystemPrompt,
          `Generate rewrites for these ${rewritableFindings.length} findings:\n\n${findingsSummary}\n\nReturn ONLY valid JSON array.`,
        );

        const rewrites = extractJsonArray(rewriteResponse.text) as any[];

        // Merge rewrites back into findings
        for (const rw of rewrites) {
          if (typeof rw.index === "number" && rw.index < rewritableFindings.length && rw.rewrite) {
            // Find this finding in the original result.findings array
            const originalFinding = result.findings.find(
              (f: any) =>
                f.asin === rewritableFindings[rw.index].asin &&
                f.field === rewritableFindings[rw.index].field &&
                f.detail === rewritableFindings[rw.index].detail
            );
            if (originalFinding) {
              originalFinding.rewrite = rw.rewrite;
            }
          }
        }
      } catch (rewriteErr: unknown) {
        // Rewrite call failed — scores still valid, just no rewrites
        logEvent({
          userEmail: session?.user?.email,
          section: "seo",
          action: "claude:seo-audit:rewrite",
          status: "error",
          message: `Rewrite generation failed: ${rewriteErr instanceof Error ? rewriteErr.message : "Unknown error"}`,
          durationMs: Date.now() - startTime,
        });
      }
    }

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:seo-audit",
      status: "success",
      resourceLabel: brandName,
      message: `Premium audit complete — score ${result.overallScore}/100, ${result.findings?.length || 0} findings, ${rewritableFindings.length} rewrites`,
      detail: {
        overallScore: result.overallScore,
        geoScore: result.geoScore,
        findingsCount: result.findings?.length || 0,
        rewriteCount: rewritableFindings.length,
        usage: scoreResponse.usage,
      },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "SEO audit failed";
    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:seo-audit",
      status: "error",
      resourceLabel: brandName,
      message: errMsg,
      detail: { error: errMsg },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
