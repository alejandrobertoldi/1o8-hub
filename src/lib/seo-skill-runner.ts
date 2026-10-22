/* eslint-disable react-doctor/server-sequential-independent-await */
// ═══════════════════════════════════════════════════════════════
// SEO Skill Runner — Orchestrates /seo skill analysis at pipeline stages
//
// Skills:
//   1. S0 Competitive Analysis — pre-pipeline, feeds into S2-S6
//
// Post-S6 validation and GEO readiness are now part of the
// premium audit in /api/seo/claude/seo-audit (merged in S6.6).
// ═══════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { seoSettings, seoProjects, seoAsins } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logEvent } from "@/lib/event-logger";

// ── Skill config check ────────────────────────────────────────

interface SkillConfig {
  s0_competitive: boolean;
}

export async function getSkillConfig(): Promise<SkillConfig> {
  const defaults: SkillConfig = { s0_competitive: false };
  try {
    const [row] = await db
      .select({ value: seoSettings.value })
      .from(seoSettings)
      .where(eq(seoSettings.key, "skill_config"))
      .limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      return { ...defaults, ...parsed };
    }
  } catch { /* use defaults */ }
  return defaults;
}

// ── Claude API helper ─────────────────────────────────────────

async function callClaude(systemPrompt: string, userPrompt: string, maxTokens = 4096): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

/** Extract JSON from Claude response (handles markdown fences) */
function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("No JSON object in response");

  let depth = 0;
  let end = -1;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("No complete JSON object in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ── Save result to seoSettings ────────────────────────────────

async function saveSkillResult(key: string, value: unknown, userEmail: string) {
  await db
    .insert(seoSettings)
    .values({
      key,
      value: JSON.stringify(value),
      updatedBy: userEmail,
    })
    .onConflictDoUpdate({
      target: seoSettings.key,
      set: {
        value: JSON.stringify(value),
        updatedAt: new Date(),
        updatedBy: userEmail,
      },
    });
}

// ── Load project data helpers ─────────────────────────────────

async function loadProjectIntake(projectId: string) {
  const [project] = await db.select().from(seoProjects).where(eq(seoProjects.id, projectId)).limit(1);
  const asins = await db.select().from(seoAsins).where(eq(seoAsins.projectId, projectId));
  return { project, asins };
}

// ═══════════════════════════════════════════════════════════════
// SKILL: S0 Competitive Analysis
// ═══════════════════════════════════════════════════════════════

export interface CompetitiveResult {
  runAt: string;
  brandName: string;
  asinCount: number;
  competitorCount: number;
  positioning: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
  };
  keywordGaps: { keyword: string; competitorUsing: string; priority: "high" | "medium" | "low" }[];
  contentRecommendations: string[];
  overallScore: number; // 0-100
}

export async function runCompetitiveAnalysis(
  projectId: string,
  userEmail: string,
): Promise<CompetitiveResult> {
  const startTime = Date.now();

  const { project, asins } = await loadProjectIntake(projectId);
  if (!project) throw new Error("Project not found");

  const brandName = project.brandName || "";
  const competitors = (project.competitors as { name: string; url: string }[]) || [];

  const asinList = asins.map(a => ({
    asin: a.asin,
    title: ((a.existingContent as any)?.item_name) || "",
    bullets: ((a.existingContent as any)?.bullet_points) || [],
    parentage: a.parentageLevel,
    variation: a.variationProduct,
  }));

  const systemPrompt = `You are a competitive intelligence analyst for Amazon product listings.
Analyze the brand's product listings against competitor information to identify positioning gaps,
keyword opportunities, and content strategy recommendations.

Return ONLY a valid JSON object with this exact structure:
{
  "positioning": {
    "strengths": ["strength 1", "strength 2", ...],
    "weaknesses": ["weakness 1", ...],
    "opportunities": ["opportunity 1", ...]
  },
  "keywordGaps": [
    { "keyword": "...", "competitorUsing": "competitor name", "priority": "high|medium|low" }
  ],
  "contentRecommendations": ["recommendation 1", ...],
  "overallScore": <0-100>
}

Score meaning: 0-40 = weak competitive position, 40-70 = moderate, 70-100 = strong.
Provide 3-5 items per category. Focus on actionable insights.`;

  const userPrompt = `Analyze competitive positioning for:

Brand: ${brandName}
Products (${asinList.length} ASINs):
${asinList.slice(0, 5).map(a => `- ${a.asin}: ${a.title} (${a.parentage})`).join("\n")}

Competitors:
${competitors.length > 0
    ? competitors.map(c => `- ${c.name}: ${c.url}`).join("\n")
    : "No competitors listed — analyze based on product category and common competitors."}

Existing content samples:
${asinList.slice(0, 2).map(a => `${a.asin}:\n  Title: ${a.title}\n  Bullets: ${(a.bullets || []).slice(0, 3).join(" | ")}`).join("\n")}

Return ONLY valid JSON.`;

  const response = await callClaude(systemPrompt, userPrompt);
  const analysis = extractJson<Omit<CompetitiveResult, "runAt" | "brandName" | "asinCount" | "competitorCount">>(response);

  const result: CompetitiveResult = {
    runAt: new Date().toISOString(),
    brandName,
    asinCount: asinList.length,
    competitorCount: competitors.length,
    ...analysis,
  };

  await saveSkillResult(`competitive:${projectId}`, result, userEmail);

  logEvent({
    userEmail,
    section: "seo",
    action: "skill:competitive",
    status: "success",
    message: `Competitive analysis completed for ${brandName}`,
    detail: { projectId, score: result.overallScore, gaps: result.keywordGaps.length },
    durationMs: Date.now() - startTime,
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Load saved competitive data (for feeding into S6 prompts)
// ═══════════════════════════════════════════════════════════════

export async function loadCompetitiveData(projectId: string): Promise<CompetitiveResult | null> {
  try {
    const [row] = await db
      .select({ value: seoSettings.value })
      .from(seoSettings)
      .where(eq(seoSettings.key, `competitive:${projectId}`))
      .limit(1);
    return row?.value ? JSON.parse(row.value) : null;
  } catch { return null; }
}
