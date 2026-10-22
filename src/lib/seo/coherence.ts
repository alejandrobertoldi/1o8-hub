import type { HumanScore } from "./human-score-rules";
export type { HumanScore, HumanScoreDetractor, HumanScorePath } from "./human-score-rules";

/**
 * Narrative coherence + Human Score pass — bullets only, runs after cmosRows (Pass 4).
 *
 * Does three things in one Claude call:
 *   1. Fixes bullet flow (B1→B5 progressive story, no duplication)
 *   2. Fixes bullet ↔ description alignment (when description available)
 *   3. Returns a Human Score (1-100) per ASIN with detractors and path-to-100 suggestions
 *
 * Score bands:
 *   90-100 = Excellent (hard to detect as AI)
 *   70-89  = Good (minor tells remaining)
 *   50-69  = Needs Work (multiple AI patterns present)
 *   1-49   = AI-Detectable (significant rewrite needed)
 *
 * Falls back to { rows, humanScores: [] } on any failure — never blocks the caller.
 *
 * The returned score covers ONLY the six judgment rows; the caller recomputes the final
 * score with computeHumanScore() (human-score-rules.ts), which scores the word/pattern rows
 * by code. No `temperature` is sent: Opus 4.7 rejects it with a 400.
 */
export async function coherenceRows(
  rows: any[],
  descriptionsByAsin: Map<string, string>,
  mustKeepKeywords: string[],
  apiKey: string,
  model: string,
  maxTokens: number,
): Promise<{ rows: any[]; humanScores: HumanScore[] }> {
  const bulletFields = [
    // One bullet set (stored as DetailedBulletPoint_1..5)
    "DetailedBulletPoint_1", "DetailedBulletPoint_2", "DetailedBulletPoint_3", "DetailedBulletPoint_4", "DetailedBulletPoint_5",
  ];

  const systemPrompt = `You are a senior Amazon content strategist and AI-writing detection expert. For every ASIN you will do three things: fix narrative coherence, then score how human the content sounds.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART A — NARRATIVE COHERENCE (rewrite if needed)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. DO THE 5 BULLET POINTS FLOW AND COMPLEMENT EACH OTHER?
   - B1-B5 each do ONE job, in order: strongest reason to buy → core differentiator → compatibility/fit/who it's for → verifiable specs → variation-specific (Child) or package contents/care (Parent)
   - No two bullets may repeat the same benefit, claim, or keyword phrase
   - B1 leads with the single strongest benefit. B5 closes with a specific differentiator.
   - Transitions between bullets should feel intentional, not random.

2. DO THE 5 BULLET POINTS COMPLEMENT THE PRODUCT DESCRIPTION?
   (Only when ProductDescription is provided)
   - No contradictions — same facts, same claims throughout
   - Bullets expand on description themes; they do not copy sentences verbatim
   - Every key differentiator in the description must be addressed by at least one bullet

REWRITE RULES:
- Fix duplication, contradiction, and missing progression
- Do NOT introduce new claims or facts not already present
- Do NOT change: keywords (verbatim), ALL CAPS bullet headers before the colon
- CHARACTER LIMIT: every bullet (DetailedBulletPoint_1-5) is 200 characters MAX, header included — a ceiling, not a target; never pad a bullet to reach it

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART B — HUMAN SCORE (1-100 per ASIN)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score starts at 100. Deduct points ONLY for the six JUDGMENT rows of the table below — Rule of three forcing, Elegant variation / synonym cycling, -ing phrase padding, Passive with no subject, Bullet incoherence, Bullets contradict description — across all bullet fields (after your Part A rewrites). Use those exact names as "pattern". The other rows are word/pattern checks scored automatically by code: do NOT list them as detractors, but DO fix them in pathTo100 rewrites. Multiple instances of the same pattern deduct multiple times.

SCORING TABLE (based on Wikipedia "Signs of AI writing" — WikiProject AI Cleanup):
| Pattern | Source | Deduction per instance |
|---|---|---|
| Significance inflation (testament, pivotal, vital role, marks a shift, enduring, evolving landscape) | §1 Undue significance | -6 |
| Promotional fluff (boasts, vibrant, breathtaking, renowned, nestled, showcasing) | §4 Promotional language | -5 |
| AI vocabulary (delve, tapestry, intricate, interplay, landscape abstract, foster, garner, underscore, align with, crucial, pivotal) | §7 Overused AI words | -4 |
| Copula avoidance ("serves as X" / "stands as X" / "represents X" instead of "is") | §8 Copula avoidance | -5 |
| -ing phrase padding (superficial -ing clauses adding no real content) | §3 Superficial -ing endings | -5 |
| Negative parallelism ("It's not just X, it's Y" / "Not merely A, it's B") | §9 Negative parallelisms | -6 |
| Rule of three forcing (ideas stuffed into exactly three items unnaturally) | §10 Rule of three | -3 |
| Elegant variation / synonym cycling (rotating product name synonyms to avoid repetition) | §11 Synonym cycling | -4 |
| Em dash overuse (more than one — per bullet) | §14 Em dash overuse | -3 |
| Filler phrases ("In order to", "Due to the fact that", "It is important to note") | §23 Filler phrases | -5 |
| Excessive hedging ("could potentially", "might have some effect") | §24 Excessive hedging | -6 |
| Generic positive conclusion ("future looks bright", "exciting times ahead") | §25 Generic conclusions | -7 |
| Passive with no subject ("No setup needed", "Results are preserved") | §13 Passive/subjectless | -4 |
| "This [product]..." instead of "Our [product]..." after a bullet header | Brand voice rule | -5 |
| Bullet incoherence (bullets repeat same claim or don't build on each other) | Coherence | -8 |
| Bullets contradict or ignore description's key differentiator | Coherence | -7 |

SCORE LABELS:
90-100 = Excellent | 70-89 = Good | 50-69 = Needs Work | 1-49 = AI-Detectable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (strict — return this exact JSON structure)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "rows": [
    {
      "ASIN": "...",
      "DetailedBulletPoint_1": "...",
      ...all bullet fields...
    }
  ],
  "scores": [
    {
      "asin": "...",
      "score": 84,
      "label": "Good",
      "detractors": [
        {
          "pattern": "Rule of three forcing",
          "source": "§10 Rule of three (Wikipedia Signs of AI writing)",
          "field": "DetailedBulletPoint_2",
          "example": "durable, versatile, and reliable",
          "impact": -3
        }
      ],
      "pathTo100": [
        {
          "field": "DetailedBulletPoint_2",
          "tip": "Drop the forced triplet and say the one thing that matters",
          "rewrite": "HEADER: Full rewritten bullet text goes here, complete field value, same character limit, no placeholder text",
          "patterns": ["Rule of three forcing"]
        }
      ],
      "descriptionChecked": true
    }
  ]
}

CRITICAL RULES FOR pathTo100:
- "field" must be one of the exact bullet field names (e.g. DetailedBulletPoint_3)
- "tip" is a short human explanation of what was wrong and why
- "rewrite" is the COMPLETE new field value — not a fragment, not an instruction — the full ready-to-use bullet text including the ALL CAPS HEADER: prefix. Must be 200 characters or fewer.
- Only include a pathTo100 entry if the issue was NOT already fixed in Part A rows. If Part A already fixed it, do not re-list it.
- AT MOST ONE pathTo100 entry per field: its "rewrite" must fix EVERY issue in that bullet at once — the judgment detractors AND any word-level patterns from the table (AI vocabulary, fluff, em dashes, etc.).
- "patterns" lists the exact "pattern" names of the judgment detractors (on that same field) the rewrite fixes; [] if none.

Return ONLY this JSON object. No markdown, no explanation outside the JSON.`;

  const keepBlock = mustKeepKeywords.length > 0
    ? `MUST-KEEP KEYWORDS (every phrase must appear verbatim — do NOT drop or substitute):\n${mustKeepKeywords.map((k) => `- ${k}`).join("\n")}\n\n`
    : "";

  const content = rows.map((r: any) => {
    const obj: Record<string, string> = { ASIN: r.ASIN };
    for (const f of bulletFields) {
      if (r[f]) obj[f] = r[f];
    }
    const desc = descriptionsByAsin.get(r.ASIN);
    if (desc) obj["ProductDescription"] = desc;
    return obj;
  });

  const userPrompt = `${keepBlock}Analyze and fix the following bullets, then return the scored result:\n\n${JSON.stringify(content, null, 1)}\n\nReturn ONLY the JSON object described in the output format.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(maxTokens, 8192),
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      return { rows, humanScores: [] };
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const objStart = cleaned.indexOf("{");
    if (objStart === -1) {
      return { rows, humanScores: [] };
    }

    let depth = 0, objEnd = -1, inStr = false, esc = false;
    for (let i = objStart; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { objEnd = i; break; } }
    }
    if (objEnd === -1) {
      return { rows, humanScores: [] };
    }

    const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
    const coherentRows: any[] = Array.isArray(parsed.rows) ? parsed.rows : [];
    const humanScores: HumanScore[] = Array.isArray(parsed.scores) ? parsed.scores : [];
    if (!coherentRows.length || coherentRows.length !== rows.length) {
      return { rows, humanScores };
    }

    const mergedRows = rows.map((orig: any, i: number) => {
      const co = coherentRows[i];
      if (!co) return orig;
      const merged = { ...orig };
      for (const f of bulletFields) {
        if (co[f]) merged[f] = co[f];
      }
      return merged;
    });

    return { rows: mergedRows, humanScores };
  } catch {
    return { rows, humanScores: [] };
  }
}
