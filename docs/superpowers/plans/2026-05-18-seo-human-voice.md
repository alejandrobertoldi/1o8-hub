# SEO Human Voice Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade S6 title and bullet generation to produce premium native American English copy from the first pass — no keyword stuffing, no stiff/formal phrasing, no non-native patterns.

**Architecture:** Three layers in one file (`src/app/api/seo/claude/seo/route.ts`): (1) `NATIVE_VOICE_CONTRACT` constant injected into titles and bullets system prompts, (2) `humanizeRows()` function that makes a post-generation Claude call to polish voice, (3) both wired into the titles and bullets batch cases.

**Tech Stack:** Next.js App Router API route, Anthropic Claude API (direct fetch), Vitest

**Spec:** `docs/superpowers/specs/2026-05-18-seo-human-voice-design.md`

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/app/api/seo/claude/seo/route.ts` | Modify | Add `NATIVE_VOICE_CONTRACT`, `humanizeRows()`, inject both into titles/bullets cases |
| `src/app/api/seo/claude/seo/route.test.ts` | Create | Full test coverage for new constant injection and humanization pass |

---

### Task 1: Create test file + add NATIVE_VOICE_CONTRACT constant

**Files:**
- Create: `src/app/api/seo/claude/seo/route.test.ts`
- Modify: `src/app/api/seo/claude/seo/route.ts` (add constant after `getVoiceInstruction`, inject into titles and bullets system prompts)

- [ ] **Step 1: Create the test file with full mock setup and two failing tests**

Create `src/app/api/seo/claude/seo/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFetch = vi.fn();

const {
  mockedGetAuthSession,
  mockedGetAiFeatureConfig,
  mockedGetConfigDocBlock,
  mockedLogEvent,
  mockedCheckRateLimit,
  mockedLoadCompetitiveData,
} = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedGetAiFeatureConfig: vi.fn(),
  mockedGetConfigDocBlock: vi.fn(),
  mockedLogEvent: vi.fn(),
  mockedCheckRateLimit: vi.fn(),
  mockedLoadCompetitiveData: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/ai-config.server", () => ({ getAiFeatureConfig: mockedGetAiFeatureConfig }));
vi.mock("@/lib/seo-config-doc", () => ({ getConfigDocBlock: mockedGetConfigDocBlock }));
vi.mock("@/lib/event-logger", () => ({ logEvent: mockedLogEvent }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mockedCheckRateLimit }));
vi.mock("@/lib/seo-skill-runner", () => ({ loadCompetitiveData: mockedLoadCompetitiveData }));
vi.mock("@/lib/seo-pipeline-config", () => ({
  CONTENT_VOICES: { natural: "Write in a natural, conversational tone." },
  CHAR_LIMITS: { title: { min: 190, max: 200 } },
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  master: {},
  varietyPackItems: {},
}));

vi.stubGlobal("fetch", mockFetch);

import { POST } from "./route";

const mockSession = { user: { email: "test@1o8.agency", name: "Test" } };
const aiConfig = { enabled: true, model: "claude-haiku-4-5-20251001", maxTokens: 8192 };

const TITLE_RESPONSE = [{ ASIN: "B001", Title: "Premium Widget - Durable Heavy Duty Design for Home and Office Use - Built to Last All Day Long and Beyond - 12 Pack" }];
const HUMANIZED_TITLE_RESPONSE = [{ ASIN: "B001", Title: "Premium Widget - Tough Enough for the Job Site, Sleek Enough for the Office - Holds Up All Day Without Fuss - 12 Pack" }];

function claudeResponse(data: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve({
      content: [{ text: JSON.stringify(data) }],
      usage: { input_tokens: 100, output_tokens: 200 },
    }),
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/seo/claude/seo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultAsins = [{ asin: "B001", parentage_level: "parent", variation_product: "", variation_theme_name: "", flavor: null, style: null, color: null, size: null, existing_content: {} }];
const defaultKeywords = [
  { KeywordText: "premium widget", KeywordPriorityTier: "T1", SearchVolume: 5000 },
  { KeywordText: "heavy duty", KeywordPriorityTier: "T2", SearchVolume: 2000 },
  { KeywordText: "home office", KeywordPriorityTier: "T4", SearchVolume: 800 },
];

const titlesBody = {
  batch: "titles",
  brandName: "TestBrand",
  asins: defaultAsins,
  keywords: defaultKeywords,
  cosmo: [],
  rufus: [],
  reviews: [],
  guidelines: "",
  currentRows: [],
  feedback: null,
  usedKeywords: [],
  contentVoice: "natural",
  projectId: null,
};

const bulletsBody = {
  ...titlesBody,
  batch: "bullets",
  currentRows: TITLE_RESPONSE,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockedGetAuthSession.mockResolvedValue(mockSession);
  mockedGetAiFeatureConfig.mockResolvedValue(aiConfig);
  mockedGetConfigDocBlock.mockResolvedValue(null);
  mockedCheckRateLimit.mockReturnValue({ success: true, resetAt: Date.now() + 60000 });
  mockedLoadCompetitiveData.mockResolvedValue(null);
});

describe("NATIVE_VOICE_CONTRACT injection", () => {
  it("injects voice contract into titles system prompt", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))   // generation
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE)); // humanization

    await POST(makeRequest(titlesBody));

    const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstCallBody.system).toContain("senior American consumer brand copywriter");
    expect(firstCallBody.system).toContain("CALIBRATION EXAMPLES");
    expect(firstCallBody.system).toContain("NEVER WRITE");
  });

  it("injects voice contract into bullets system prompt", async () => {
    const bulletsResponse = [{ ASIN: "B001", DetailedBulletPoint_1: "STRONG GRIP: Holds tight all day.", DetailedBulletPoint_2: "EASY SETUP: Ready in minutes.", DetailedBulletPoint_3: "BUILT TO LAST: Made for daily use.", DetailedBulletPoint_4: "MULTI-USE: Works indoors and out.", DetailedBulletPoint_5: "YOUR SIZE: Available in all sizes.", ConciseBulletPoint_1: "STRONG GRIP: All-day hold.", ConciseBulletPoint_2: "EASY SETUP: Minutes to install.", ConciseBulletPoint_3: "BUILT TOUGH: Daily use ready.", ConciseBulletPoint_4: "MULTI-USE: Inside or outside.", ConciseBulletPoint_5: "YOUR FIT: All sizes available.", ContentBulletPoint_1: "STRONG GRIP: Holds all day.", ContentBulletPoint_2: "EASY SETUP: Fast install.", ContentBulletPoint_3: "DURABLE: Built to last.", ContentBulletPoint_4: "VERSATILE: Works anywhere.", ContentBulletPoint_5: "FITS ALL: Every size.", KeyFeaturesBulletPoint_1: "STRONG GRIP", KeyFeaturesBulletPoint_2: "EASY SETUP", KeyFeaturesBulletPoint_3: "DURABLE BUILD", KeyFeaturesBulletPoint_4: "MULTI-USE", KeyFeaturesBulletPoint_5: "ALL SIZES" }];

    mockFetch
      .mockResolvedValueOnce(claudeResponse(bulletsResponse))
      .mockResolvedValueOnce(claudeResponse(bulletsResponse));

    await POST(makeRequest(bulletsBody));

    const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstCallBody.system).toContain("senior American consumer brand copywriter");
    expect(firstCallBody.system).toContain("CALIBRATION EXAMPLES");
  });
});

describe("humanization pass", () => {
  it("titles batch makes two Claude calls: generation then humanization", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE));

    const res = await POST(makeRequest(titlesBody));
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("returns humanized titles when humanization succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE));

    const res = await POST(makeRequest(titlesBody));
    const data = await res.json();
    expect(data[0].Title).toBe(HUMANIZED_TITLE_RESPONSE[0].Title);
  });

  it("returns original titles when humanization call fails", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve("Rate limit") });

    const res = await POST(makeRequest(titlesBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].Title).toBe(TITLE_RESPONSE[0].Title);
  });

  it("returns original titles when humanization returns unparseable JSON", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: "not valid json at all" }], usage: {} }),
      });

    const res = await POST(makeRequest(titlesBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data[0].Title).toBe(TITLE_RESPONSE[0].Title);
  });

  it("humanizer system prompt instructs to fix stiff phrasing without dropping keywords", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE));

    await POST(makeRequest(titlesBody));

    const humanizeCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(humanizeCallBody.system).toContain("native American English editor");
    expect(humanizeCallBody.system).toContain("DO NOT CHANGE");
  });

  it("passes must-keep keywords to humanizer when usedKeywords provided", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE));

    await POST(makeRequest({ ...titlesBody, usedKeywords: ["premium widget", "heavy duty"] }));

    const humanizeCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(humanizeCallBody.messages[0].content).toContain("premium widget");
    expect(humanizeCallBody.messages[0].content).toContain("heavy duty");
  });
});
```

- [ ] **Step 2: Run tests to verify they all fail**

```bash
cd /Users/manu/1o8Hub && npm test src/app/api/seo/claude/seo/route.test.ts 2>&1 | tail -30
```

Expected: All tests fail — `POST` does not yet include voice contract or humanization.

- [ ] **Step 3: Add NATIVE_VOICE_CONTRACT constant to route.ts**

Open `src/app/api/seo/claude/seo/route.ts`. After the closing brace of `getVoiceInstruction` (line ~42), insert:

```typescript
/** Native American English voice contract — injected into titles and bullets system prompts */
const NATIVE_VOICE_CONTRACT = `
VOICE & WRITING STANDARD (NON-NEGOTIABLE):

You are a senior American consumer brand copywriter — not an SEO technician. You write the way a native American speaker thinks: direct, benefit-led, natural rhythm.

WRITING PRINCIPLES:
1. Lead with the benefit, not the feature — "Stays put all day" not "Features enhanced adhesive technology"
2. Use contractions where natural — "doesn't", "you'll", "it's", "won't", "can't"
3. Vary sentence rhythm — mix short punchy statements with longer explanatory ones; never write four long sentences in a row
4. American idiom over formal register — "works great for" not "is well-suited to facilitate"; "easy to use" not "demonstrates ease of utilization"
5. Every sentence must earn its place — if it only strings keywords together with no real meaning, rewrite it

NEVER WRITE (non-native, robotic patterns):
- "Facilitates the enhancement of..." → write "helps you..."
- "Demonstrates suitability for utilization across..." → write "works great for..."
- "Provides to users the benefit of..." → write "gives you..."
- "Is well-suited to meet the needs of..." → write "perfect for..."
- "This product features advanced..." → write "Built with..." or "You get..."
- Pure keyword lists disguised as sentences: "Premium organic turmeric curcumin supplement capsules black pepper bioperine joint support" is NOT a sentence

CALIBRATION EXAMPLES:

Title — keyword dump → descriptive narrative:
❌ "Premium Organic Turmeric Curcumin Supplement Capsules Black Pepper BioPerine Joint Support Inflammation Relief Non-GMO"
✅ "Premium Turmeric Curcumin with BioPerine - Supports Joint Comfort and Healthy Inflammation Response for Active Adults - 120 Capsules"

Detailed bullet — feature list → benefit story:
❌ "SUPERIOR ABSORPTION: Formulated with advanced bioavailability enhancement technology utilizing black pepper extract for maximum nutrient uptake and absorption optimization"
✅ "ABSORBS UP TO 20X BETTER: Black pepper BioPerine dramatically boosts how much turmeric your body actually uses — so you get the full benefit of every capsule, not just what passes through"

Detailed bullet — stiff/formal → natural/conversational:
❌ "VERSATILE APPLICATION: This product demonstrates suitability for utilization across multiple contexts and environments including indoor and outdoor recreational activities"
✅ "READY FOR ANYTHING: Whether you're hiking, at the gym, or running errands, these hold up all day without slipping, bunching, or leaving marks"
`.trim();
```

- [ ] **Step 4: Inject NATIVE_VOICE_CONTRACT into titles system prompt**

In `src/app/api/seo/claude/seo/route.ts`, find the titles `systemPrompt` string in `case "titles"`. It currently ends with:

```typescript
      systemPrompt = `You are the Amazon Listing Title Generator for 1o8 SEO Manager.
${complianceRules}

TITLE RULES:
```

Change to:

```typescript
      systemPrompt = `You are the Amazon Listing Title Generator for 1o8 SEO Manager.
${complianceRules}

${NATIVE_VOICE_CONTRACT}

TITLE RULES:
```

- [ ] **Step 5: Inject NATIVE_VOICE_CONTRACT into bullets system prompt**

In `src/app/api/seo/claude/seo/route.ts`, find the bullets `systemPrompt` string in `case "bullets"`. It currently ends with:

```typescript
      systemPrompt = `You are the Amazon Bullet Point Generator for 1o8 SEO Manager.
${complianceRules}

BULLET RULES:
```

Change to:

```typescript
      systemPrompt = `You are the Amazon Bullet Point Generator for 1o8 SEO Manager.
${complianceRules}

${NATIVE_VOICE_CONTRACT}

BULLET RULES:
```

- [ ] **Step 6: Run the injection tests — they should now pass**

```bash
cd /Users/manu/1o8Hub && npm test src/app/api/seo/claude/seo/route.test.ts --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|injects)"
```

Expected: The two "injects voice contract" tests pass. The humanization tests still fail.

---

### Task 2: Add humanizeRows function + wire into titles and bullets

**Files:**
- Modify: `src/app/api/seo/claude/seo/route.ts` (add `humanizeRows` before `export async function POST`, wire into titles and bullets cases)

- [ ] **Step 1: Add humanizeRows function to route.ts**

In `src/app/api/seo/claude/seo/route.ts`, immediately before the line `export async function POST(req: NextRequest) {`, insert:

```typescript
/** Fields extracted per batch for humanization */
const HUMANIZE_FIELDS: Record<"titles" | "bullets", string[]> = {
  titles: ["Title"],
  bullets: [
    "DetailedBulletPoint_1", "DetailedBulletPoint_2", "DetailedBulletPoint_3", "DetailedBulletPoint_4", "DetailedBulletPoint_5",
    "ConciseBulletPoint_1", "ConciseBulletPoint_2", "ConciseBulletPoint_3", "ConciseBulletPoint_4", "ConciseBulletPoint_5",
    "ContentBulletPoint_1", "ContentBulletPoint_2", "ContentBulletPoint_3", "ContentBulletPoint_4", "ContentBulletPoint_5",
    "KeyFeaturesBulletPoint_1", "KeyFeaturesBulletPoint_2", "KeyFeaturesBulletPoint_3", "KeyFeaturesBulletPoint_4", "KeyFeaturesBulletPoint_5",
  ],
};

const HUMANIZE_CHAR_LIMITS: Record<"titles" | "bullets", string> = {
  titles: "Titles: 190-200 characters exactly.",
  bullets: "Detailed bullets: 390-400 chars. Concise bullets: 190-200 chars. Content bullets: 90-100 chars. Key Features bullets: 40-50 chars.",
};

/**
 * Post-generation voice polish pass.
 * Calls Claude with a focused humanization prompt to fix stiff/non-native phrasing.
 * Returns the humanized rows on success, original rows on any failure.
 * Never throws — caller always gets usable rows back.
 */
async function humanizeRows(
  batch: "titles" | "bullets",
  rows: any[],
  mustKeepKeywords: string[],
  apiKey: string,
  model: string,
  maxTokens: number,
): Promise<any[]> {
  const fields = HUMANIZE_FIELDS[batch];

  const systemPrompt = `You are a native American English editor. Your only job is to rewrite the content so it sounds like it was written by a senior copywriter at a premium US consumer brand — not an AI, not an SEO tool, not a translator.

FIX: stiff or formal phrasing, non-native sentence structure, hollow keyword-only sentences, over-long words where short ones work, missing contractions where natural.

DO NOT CHANGE: keywords (they must appear verbatim), JSON field names, ASIN values, ALL CAPS bullet headers before the colon.
DO NOT EXCEED character limits: ${HUMANIZE_CHAR_LIMITS[batch]}

Return ONLY a valid JSON array with the exact same structure as the input.`;

  const keepBlock = mustKeepKeywords.length > 0
    ? `MUST-KEEP KEYWORDS (every phrase must appear verbatim in at least one field — do NOT drop or substitute):\n${mustKeepKeywords.map((k) => `- ${k}`).join("\n")}\n\n`
    : "";

  const content = rows.map((r: any) => {
    const obj: Record<string, string> = { ASIN: r.ASIN };
    for (const f of fields) {
      if (r[f]) obj[f] = r[f];
    }
    return obj;
  });

  const userPrompt = `${keepBlock}Rewrite the following ${batch} for premium American English voice:\n\n${JSON.stringify(content, null, 1)}\n\nReturn ONLY valid JSON array.`;

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

    if (!res.ok) return rows;

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    // Parse balanced JSON array (same approach as callClaudeAndParse)
    const cleaned = text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const arrStart = cleaned.indexOf("[");
    if (arrStart === -1) return rows;
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
    if (arrEnd === -1) return rows;

    const humanized: any[] = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(humanized) || humanized.length !== rows.length) return rows;

    // Merge humanized fields back — preserve all non-content fields from original
    return rows.map((orig: any, i: number) => {
      const hu = humanized[i];
      if (!hu) return orig;
      const merged = { ...orig };
      for (const f of fields) {
        if (hu[f]) merged[f] = hu[f];
      }
      return merged;
    });
  } catch {
    return rows;
  }
}
```

- [ ] **Step 2: Wire humanizeRows into the titles batch case**

In `src/app/api/seo/claude/seo/route.ts`, inside the `try` block of `export async function POST`, find this block in the titles case (around line 558):

```typescript
    let { rows, usage: totalUsage } = await callClaudeAndParse(finalSystemPrompt, userPrompt, aiConfig.model, aiConfig.maxTokens);
```

Change it to:

```typescript
    let { rows, usage: totalUsage } = await callClaudeAndParse(finalSystemPrompt, userPrompt, aiConfig.model, aiConfig.maxTokens);

    // Humanization pass — titles and bullets only
    if (batch === "titles" || batch === "bullets") {
      const allKeywords = (body.keywords || []).map((k: any) => k.KeywordText).filter(Boolean) as string[];
      const mustKeep = (body.usedKeywords || []).concat(
        (body.keywords || []).filter((k: any) => k.KeywordPriorityTier === "T1" || k.KeywordPriorityTier === "T2").map((k: any) => k.KeywordText)
      ).filter(Boolean) as string[];
      rows = await humanizeRows(batch as "titles" | "bullets", rows, [...new Set([...mustKeep, ...allKeywords.slice(0, 20)])], apiKey!, aiConfig.model, aiConfig.maxTokens);
    }
```

> **Note:** This single block handles both titles and bullets — no need to add it twice. The switch statement sets `batch` before this try block runs.

- [ ] **Step 3: Run all tests**

```bash
cd /Users/manu/1o8Hub && npm test src/app/api/seo/claude/seo/route.test.ts --reporter=verbose 2>&1 | tail -40
```

Expected: All tests pass.

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
cd /Users/manu/1o8Hub && npm test 2>&1 | tail -20
```

Expected: Same pass/fail count as baseline (~9 pre-existing failures, none new).

- [ ] **Step 5: Verify build succeeds**

```bash
cd /Users/manu/1o8Hub && npm run build 2>&1 | tail -20
```

Expected: Build completes with no new errors (3 pre-existing tsc errors are acceptable).

- [ ] **Step 6: Commit**

```bash
cd /Users/manu/1o8Hub && git add src/app/api/seo/claude/seo/route.ts src/app/api/seo/claude/seo/route.test.ts docs/superpowers/specs/2026-05-18-seo-human-voice-design.md docs/superpowers/plans/2026-05-18-seo-human-voice.md
git commit -m "$(cat <<'EOF'
feat(seo): native voice contract + humanization pass for titles and bullets

- Add NATIVE_VOICE_CONTRACT with persona, 5 writing principles, anti-patterns,
  and 3 calibration examples (bad→good) injected into titles and bullets system prompts
- Add humanizeRows() post-generation Claude call that polishes voice without
  touching keywords, structure, or character limits; falls back to original on failure
- Wire humanization pass into both batch cases in the POST handler
- Full Vitest coverage: injection tests, humanization success/failure/fallback,
  must-keep keyword passing, system prompt content verification

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Layer 1 (voice contract + calibration examples): Task 1, Steps 3–5
- ✅ Layer 2 (humanizeRows function): Task 2, Step 1
- ✅ Layer 3 (wired into titles + bullets): Task 2, Step 2
- ✅ Failure fallback (original rows returned): Task 1 test file, `returns original titles when humanization call fails`
- ✅ Must-keep keywords passed to humanizer: Task 1 test file, `passes must-keep keywords to humanizer`
- ✅ description and backend untouched: `batch === "titles" || batch === "bullets"` guard in humanization block
- ✅ computeLengths + title auto-fix run after humanization: humanization block runs before the existing `if (batch === "titles") { const { min, max } = CHAR_LIMITS...` block — order preserved

**Placeholder scan:** None found.

**Type consistency:** `humanizeRows` typed `batch: "titles" | "bullets"` matches `HUMANIZE_FIELDS` and `HUMANIZE_CHAR_LIMITS` keys. `batch as "titles" | "bullets"` cast in POST handler is safe because the guard already checks for those two values.
