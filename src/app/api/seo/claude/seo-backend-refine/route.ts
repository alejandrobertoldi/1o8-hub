import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { getAiFeatureConfig } from "@/lib/ai-config.server";

export const maxDuration = 60;

const STOP_WORDS = new Set([
  "the","a","an","for","with","and","of","in","to","is","it","by","on","at",
  "or","as","from","this","that","your","our","its","are","was","be","has",
  "have","will","can","all","any","not","but","so","if","no","up","do","my",
]);

export async function POST(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });

  const aiConfig = await getAiFeatureConfig("seo_content");
  if (!aiConfig.enabled) return NextResponse.json({ error: "Feature disabled" }, { status: 403 });

  const body = await req.json();
  const { rows, keywords, guidelines } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows is required and must be non-empty" }, { status: 400 });
  }

  // Build per-ASIN exclusion sets from title + bullets + description
  const perAsinWords = new Map<string, Set<string>>();
  for (const row of rows) {
    const asin = String(row.ASIN || row.asin || "");
    if (!asin) continue;
    const asinWords = new Set<string>();
    const sources = [
      row.Title || "",
      row.ProductDescription || "",
      row.DetailedBulletPoint_1 || "", row.DetailedBulletPoint_2 || "",
      row.DetailedBulletPoint_3 || "", row.DetailedBulletPoint_4 || "",
      row.DetailedBulletPoint_5 || "",
    ];
    for (const src of sources) {
      for (const w of src.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
        if (w.length > 2 && !STOP_WORDS.has(w)) asinWords.add(w);
      }
    }
    perAsinWords.set(asin, asinWords);
  }
  // Combined set for prompt guidance
  const listingWords = new Set<string>();
  for (const ws of perAsinWords.values()) for (const w of ws) listingWords.add(w);

  const negativeKws = (keywords || [])
    .filter((k: any) => k.KeywordIsNegative)
    .map((k: any) => String(k.KeywordText).toLowerCase());

  const tier4 = (keywords || [])
    .filter((k: any) => k.KeywordPriorityTier === "T4")
    .slice(0, 30)
    .map((k: any) => k.KeywordText as string);

  const tier3 = (keywords || [])
    .filter((k: any) => k.KeywordPriorityTier === "T3")
    .slice(0, 15)
    .map((k: any) => k.KeywordText as string);

  const asinList = rows.map((r: any) => (r.ASIN || r.asin) as string).filter(Boolean);

  const exclusionBlock = listingWords.size > 0
    ? `\nWORDS ALREADY INDEXED (title + bullets + descriptions — exclude from backend):\n${[...listingWords].join(" ")}`
    : "";
  const negativeBlock = negativeKws.length > 0
    ? `\nNEGATIVE KEYWORDS (wrong form/type/ingredient — never include):\n${negativeKws.join(", ")}`
    : "";

  const systemPrompt = `You are the Amazon Backend Search Terms Generator for 1o8 SEO Manager.

BACKEND RULES:
- ONE BackendSearchTerms field per ASIN. Maximum 249 bytes (UTF-8). Pack as close to 249 bytes as possible.
- Use ONLY T4 keywords not already covered by the listing's title/bullets (exclusion list provided).
- Never include words from the exclusion list — Amazon already indexes those from surface content.
- Never include negative keywords (wrong form/type/ingredient) — they attract irrelevant traffic.
- Lowercase. Space-separated. No punctuation except hyphens within compound words. No repeated words.
- No brand name. No competitor names. No prohibited terms.
- Prioritize: synonyms, spelling variants (US/UK), use-case expansions, materials, demographics, occasions.
- Output as ONE combined space-separated string.

OUTPUT FORMAT: Return a JSON array:
{ "ASIN": "...", "BackendSearchTerms": "..." }
Do NOT include ByteLength fields — they are computed server-side.`;

  const userPrompt = `Generate backend search terms.

⚠️ HARD CAP — NON-NEGOTIABLE: Each ASIN's BackendSearchTerms MUST be ≤ 249 bytes (UTF-8). Even 1 byte over de-indexes ALL keywords for that ASIN. Count bytes before returning; drop lowest-tier terms first if over.
Pack as close to 249 bytes as possible — unused bytes are wasted indexing opportunities.

ASINs: ${asinList.join(", ")}

Tier 4 keywords (primary source):
${tier4.join(", ")}

Tier 3 (gap fill if bytes remain):
${tier3.join(", ")}
${exclusionBlock}${negativeBlock}${typeof guidelines === "string" && guidelines.trim() ? `
BRAND GUIDELINES (follow any rules about words to exclude, competitor names or claims):
${guidelines.trim()}
` : ""}
Return ONLY valid JSON array.`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return NextResponse.json({ error: `Claude API ${claudeRes.status}: ${errText}` }, { status: 500 });
    }

    const data = await claudeRes.json();
    const text: string = data.content?.[0]?.text || "";

    // Strip markdown fences, then extract balanced JSON array
    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const arrStart = cleaned.indexOf("[");
    if (arrStart === -1) {
      return NextResponse.json({ error: "No JSON array in Claude response" }, { status: 500 });
    }
    let depth = 0, arrEnd = -1, inStr = false, esc = false;
    for (let i = arrStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "[") depth++;
      else if (ch === "]") { depth--; if (depth === 0) { arrEnd = i; break; } }
    }
    if (arrEnd === -1) {
      return NextResponse.json({ error: "Incomplete JSON array in Claude response" }, { status: 500 });
    }

    const parsed: any[] = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));

    // Normalize ASIN key
    for (const row of parsed) {
      if (!row.ASIN && row.asin) { row.ASIN = row.asin; delete row.asin; }
    }

    // Hard-filter: strip words already present in each ASIN's visible content
    for (const row of parsed) {
      const excluded = perAsinWords.get(String(row.ASIN || ""));
      if (!excluded || !row.BackendSearchTerms) continue;
      row.BackendSearchTerms = String(row.BackendSearchTerms)
        .split(/\s+/)
        .filter((w: string) => w && !excluded.has(w.toLowerCase()))
        .join(" ");
    }

    // Hard-cap at 249 bytes
    const enc = new TextEncoder();
    const MAX_BYTES = 249;
    for (const row of parsed) {
      const original = String(row.BackendSearchTerms || "");
      if (!original) continue;
      const terms = original.split(/\s+/).filter(Boolean);
      while (terms.length && enc.encode(terms.join(" ")).length > MAX_BYTES) terms.pop();
      row.BackendSearchTerms = terms.join(" ");
      row.BackendSearchTerms_ByteLength = enc.encode(row.BackendSearchTerms).length;
    }

    return NextResponse.json({ rows: parsed });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
