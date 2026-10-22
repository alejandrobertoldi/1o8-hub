/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S4 Alexa for Shopping API — Claude AI
// POST /api/claude/rufus
// Actions: map_answers, generate_phase2, analyze
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getConfigDocBlock } from "@/lib/seo-config-doc";
import { getAuthSession } from "@/lib/auth-db";
import { logEvent } from "@/lib/event-logger";
import { getAiFeatureConfig } from "@/lib/ai-config.server";
import { checkRateLimit } from "@/lib/rate-limit";
import { coerceMappedAnswers, extractJsonArray } from "@/lib/seo/alexa-answer-map";

export const maxDuration = 300;

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

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
    const aiConfig = await getAiFeatureConfig("seo_rufus");
    if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

    const body = await req.json();
    const { action } = body;
    if (action === "map_answers") return handleMapAnswers(body, session, startTime, aiConfig);
    if (action === "generate_phase2") return handleGeneratePhase2(body, session, startTime, aiConfig);
    if (action === "analyze") return handleAnalyze(body, session, startTime, aiConfig);
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    console.error("Alexa for Shopping API error:", err);
    const errMsg = err instanceof Error ? err.message : "Failed";
    const errStatus = err instanceof Anthropic.APIError ? err.status : undefined;

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:rufus",
      status: "error",
      message: errMsg,
      detail: { error: errMsg },
      durationMs: Date.now() - startTime,
    });

    const status = errStatus === 404 ? 500 : errStatus === 429 ? 429 : 500;
    const msg = errMsg.includes("ANTHROPIC_API_KEY") ? "Anthropic API key is not configured."
      : errStatus === 404 || errMsg.includes("not_found") ? "Invalid AI model configured. Check SEO Config."
      : errStatus === 429 ? "Rate limit reached. Try again shortly."
      : "Alexa for Shopping generation failed. Check server logs.";
    return NextResponse.json({ error: msg }, { status });
  }
}

// ── Map pasted answers onto the questions ────────────────────
// Alexa for Shopping replies are heterogeneous (numbered, unnumbered, merged,
// with page chrome), so a regex parser mis-maps them. Claude does the mapping,
// copying the answer text verbatim.

async function handleMapAnswers(body: any, session: any, startTime: number, aiConfig: { model: string; maxTokens: number }) {
  const questions: string[] = Array.isArray(body.questions) ? body.questions.filter((q: unknown) => typeof q === "string") : [];
  const raw: string = typeof body.raw === "string" ? body.raw.trim() : "";
  if (questions.length === 0 || !raw) {
    return NextResponse.json({ error: "questions and raw text are required" }, { status: 400 });
  }

  const systemPrompt = `You map a pasted chat transcript from Alexa for Shopping (Amazon's AI shopping assistant, formerly Rufus) onto the questions that were asked.

Rules:
- Return ONLY a JSON array of ${questions.length} strings, one per question, in the same order.
- Each string is that question's answer copied VERBATIM from the transcript — do not rewrite, summarize, translate or add anything.
- Answers may be numbered or not, out of order, merged into one block, or split across paragraphs; match by meaning.
- Drop page chrome that isn't part of an answer: echoed questions, "Was this helpful?", ratings, follow-up suggestion chips, "Trusted by professionals", "Ask something else", product-card text, sponsored text.
- If a question was not answered, use "".`;

  const userPrompt = `QUESTIONS:
${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

TRANSCRIPT:
${raw.slice(0, 60_000)}`;

  const response = await getAnthropicClient().messages.create({
    model: aiConfig.model,
    max_tokens: Math.max(aiConfig.maxTokens, 8000),
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const parsed = extractJsonArray(text);
  if (!parsed) return NextResponse.json({ error: "AI mapping returned no answers" }, { status: 502 });
  const answers = coerceMappedAnswers(parsed, questions.length);

  logEvent({
    userEmail: session?.user?.email,
    userName: session?.user?.name,
    section: "seo",
    action: "claude:rufus:map_answers",
    status: "success",
    message: `Mapped ${answers.filter(Boolean).length}/${questions.length} answers`,
    detail: { questionsCount: questions.length, answered: answers.filter(Boolean).length, usage: response.usage },
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json({ answers, usage: response.usage });
}

// ── Generate Phase 2 Strategic Questions ─────────────────────

async function handleGeneratePhase2(body: any, session: any, startTime: number, aiConfig: { model: string; maxTokens: number }) {
  const { phase1, brandName, productName, guidelines } = body;

  const systemPrompt = `You are the ALEXA FOR SHOPPING Optimization Engine for Amazon listing SEO.

Given the Phase 1 foundational Q&A from Alexa for Shopping (Amazon's AI shopping assistant, formerly Rufus), generate 8-10 additional strategic questions to ask Alexa for Shopping for deeper discovery.

RULES:
- Every question MUST end with a question mark
- Questions must be short and direct for Alexa for Shopping chat input
- Focus on: usage patterns, objection resolution, competitive positioning, audience segments, purchase triggers, seasonal usage, gifting context, complementary products
- No quotation marks in questions
- Each question should explore a different angle not covered in Phase 1
- Questions should help inform listing optimization, A+ content, and image strategy

OUTPUT: Return ONLY a JSON array of question strings. No markdown, no code fences.
Example: ["What ingredients does this product contain?", "How quickly does this product work?"]`;

  const guidelinesSection = guidelines
    ? `\nBRAND GUIDELINES (use to shape question relevance and brand voice):\n${guidelines.substring(0, 600)}\n`
    : "";

  const userPrompt = `Product: ${brandName} — ${productName}
${guidelinesSection}
Phase 1 Responses:
${phase1.map((p: any, i: number) => `Q${i + 1}: ${p.question}\nA${i + 1}: ${p.answer}`).join("\n\n")}

Generate 8-10 strategic Phase 2 questions.`;

  const response = await getAnthropicClient().messages.create({
    model: aiConfig.model,
    max_tokens: aiConfig.maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let questions;
  try {
    questions = JSON.parse(clean);
  } catch {
    const lines = clean
      .split("\n")
      .filter((l) => l.trim().endsWith("?"))
      .map((l) => l.replace(/^[\s\-\d.*"]+/, "").replace(/[",\]]+$/, "").trim());
    if (lines.length > 0) {
      questions = lines;
    } else {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }
  }

  logEvent({
    userEmail: session?.user?.email,
    userName: session?.user?.name,
    section: "seo",
    action: "claude:rufus:generate_phase2",
    status: "success",
    resourceLabel: `${brandName} — ${productName}`,
    message: `Generated ${Array.isArray(questions) ? questions.length : 0} Phase 2 questions`,
    detail: { questionsCount: Array.isArray(questions) ? questions.length : 0, usage: response.usage },
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json({ questions, usage: response.usage });
}

// ── Analyze All Q&A into the Q&A insights table ──────────────────────────────

async function handleAnalyze(body: any, session: any, startTime: number, aiConfig: { model: string; maxTokens: number }) {
  const { allQA, brandName, productName, guidelines } = body;

  const systemPrompt = `You are the ALEXA FOR SHOPPING Analysis Engine for 1o8 SEO (ALEXA FOR SHOPPING + COSMO system).

Analyze each Alexa for Shopping Q&A pair and produce structured intelligence for the Alexa for Shopping Q&A insights table.

FOR EACH Q&A PAIR, determine:

1. RufusQuestionCategory: One of — Product Identity, Usage & Application, Customer Satisfaction, Customer Dissatisfaction, Competitive Landscape, Purchase Decision, Ingredient & Composition, Efficacy & Performance, Audience & Demographics, Seasonal & Contextual

2. RufusInsightType: One of — Core Benefit, Objection, Desire, Usage Pattern, Competitive Advantage, Purchase Trigger, Trust Signal, Value Proposition

3. RufusPrimaryObjectionAddressed: The main customer objection this Q&A helps resolve, or "None identified"

4. RufusPrimaryDesireAddressed: The main customer desire this Q&A satisfies, or "None identified"

5. RufusCOSMORelationship: Primary COSMO relationship type — USED_FOR_FUNC, USED_TO, CAPABLE_OF, USED_FOR_EVE, USED_ON, USED_IN_LOC, USED_AS, IS_A, xIS_A, USED_IN_BODY, USED_WITH, USED_FOR_AUD, USED_BY, xINTERESTED_IN, xWANT

6. RufusUsageContext: How/when the product is used based on this Q&A — e.g., "Daily wellness routine", "Emergency relief", "Athletic recovery"

7. RufusNotes: Any additional flags — competitor mentions, compliance concerns, gaps, cross-reference notes. Use "None" if nothing notable.

RULES:
- ASIN must be "ParentASIN" for all rows (variation family scope)
- No field may be blank
- RufusQuestion and RufusAnswer must be preserved exactly as provided
- One row per Q&A pair

OUTPUT: Return ONLY a valid JSON array. Each object:
{
  "ASIN": "ParentASIN",
  "RufusQuestion": "...",
  "RufusAnswer": "...",
  "RufusQuestionCategory": "...",
  "RufusInsightType": "...",
  "RufusPrimaryObjectionAddressed": "...",
  "RufusPrimaryDesireAddressed": "...",
  "RufusCOSMORelationship": "...",
  "RufusUsageContext": "...",
  "RufusNotes": "..."
}

No markdown, no code fences, no explanation.`;

  const guidelinesSection = guidelines
    ? `\nBRAND GUIDELINES (apply brand voice and audience context to all analysis):\n${guidelines.substring(0, 600)}\n`
    : "";

  const qaBlock = (allQA || [])
    .map((qa: any, i: number) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
    .join("\n\n");

  const userPrompt = `Product: ${brandName} — ${productName}
Total Q&A pairs: ${(allQA || []).length}
${guidelinesSection}
${qaBlock}

Analyze ALL ${(allQA || []).length} Q&A pairs. Return the complete JSON array.`;

  const configBlock = await getConfigDocBlock(3000);
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

  try {
    const rows = JSON.parse(clean);

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:rufus:analyze",
      status: "success",
      resourceLabel: `${brandName} — ${productName}`,
      message: `Analyzed ${rows.length} Q&A pairs`,
      detail: { qaIn: (allQA || []).length, rowsOut: rows.length, usage: response.usage },
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json({ rows, usage: response.usage });
  } catch {
    console.error("Alexa for Shopping analyze parse failed:", clean.substring(0, 200));

    logEvent({
      userEmail: session?.user?.email,
      userName: session?.user?.name,
      section: "seo",
      action: "claude:rufus:analyze",
      status: "warning",
      resourceLabel: `${brandName} — ${productName}`,
      message: "AI response parse failed — returned fallback rows",
      detail: { qaIn: (allQA || []).length, usage: response.usage },
      durationMs: Date.now() - startTime,
    });

    const rows = (allQA || []).map((qa: any) => ({
      ASIN: "ParentASIN",
      RufusQuestion: qa.question,
      RufusAnswer: qa.answer,
      RufusQuestionCategory: "Parse Error",
      RufusInsightType: "Parse Error",
      RufusPrimaryObjectionAddressed: "Not analyzed",
      RufusPrimaryDesireAddressed: "Not analyzed",
      RufusCOSMORelationship: "Not analyzed",
      RufusUsageContext: "Not analyzed",
      RufusNotes: "AI analysis failed — re-run",
    }));
    return NextResponse.json({ rows, usage: response.usage });
  }
}
