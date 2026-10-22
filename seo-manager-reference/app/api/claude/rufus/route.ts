/* eslint-disable react-doctor/js-combine-iterations */
// ═══════════════════════════════════════════════════════════════
// S4 Rufus API — Claude AI
// POST /api/claude/rufus
// Actions: generate_phase2, analyze
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
    if (action === "generate_phase2") return handleGeneratePhase2(body);
    if (action === "analyze") return handleAnalyze(body);
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Rufus API error:", err);
    return NextResponse.json({ error: err.message || "Failed" }, { status: 500 });
  }
}

// ── Generate Phase 2 Strategic Questions ─────────────────────

async function handleGeneratePhase2(body: any) {
  const { phase1, brandName, productName, guidelines } = body;

  const systemPrompt = `You are the RUFUS Optimization Engine for Amazon listing SEO.

Given the Phase 1 foundational Q&A from Rufus, generate 8-10 additional strategic questions to ask Rufus for deeper discovery.

RULES:
- Every question MUST end with a question mark
- Questions must be short and direct for Rufus chat input
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

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
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

  return NextResponse.json({ questions, usage: response.usage });
}

// ── Analyze All Q&A into OUT_RUF ──────────────────────────────

async function handleAnalyze(body: any) {
  const { allQA, brandName, productName, guidelines } = body;

  const systemPrompt = `You are the RUFUS Analysis Engine for 1o8 Marketplace SEO (RUFUS + COSMO system).

Analyze each Rufus Q&A pair and produce structured intelligence for the OUT_RUF table.

FOR EACH Q&A PAIR, determine:

1. RufusQuestionCategory: One of — Product Identity, Usage & Application, Customer Satisfaction, Customer Dissatisfaction, Competitive Landscape, Purchase Decision, Ingredient & Composition, Efficacy & Performance, Audience & Demographics, Seasonal & Contextual

2. RufusInsightType: One of — Core Benefit, Objection, Desire, Usage Pattern, Competitive Advantage, Purchase Trigger, Trust Signal, Value Proposition

3. RufusPrimaryObjectionAddressed: The main customer objection this Q&A helps resolve, or "None identified"

4. RufusPrimaryDesireAddressed: The main customer desire this Q&A satisfies, or "None identified"

5. RufusCOSMORelationship: Primary COSMO relationship type — IS_A, HAS_A, USED_FOR, USED_FOR_AUD, MADE_OF, SOLD_AS, COMPARED_TO, INTERESTED_IN, AVAILABLE_IN

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

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  try {
    const rows = JSON.parse(clean);
    return NextResponse.json({ rows, usage: response.usage });
  } catch {
    console.error("Rufus analyze parse failed:", clean.substring(0, 200));
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
