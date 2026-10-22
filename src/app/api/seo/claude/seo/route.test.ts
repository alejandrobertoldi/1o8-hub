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
  CHAR_LIMITS: { title: { min: 1, max: 75 }, item_highlight: { min: 1, max: 125 } },
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
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

import { POST } from "./route";

const mockSession = { user: { email: "test@marketfoundry.agency", name: "Test" } };
const aiConfig = { enabled: true, model: "claude-haiku-4-5-20251001", maxTokens: 8192 };

// Titles ≤75 chars so the auto-fix retry does NOT fire (no over-length trim needed).
const TITLE_RESPONSE = [{
  ASIN: "B001",
  Title: "Premium Widget - Heavy Duty Home Office",
  ItemHighlight: "Built to Last, All-Day Comfort, 12 Pack",
}];
const HUMANIZED_TITLE_RESPONSE = [{
  ASIN: "B001",
  Title: "Premium Widget - Tough Heavy Duty Build",
  ItemHighlight: "Built to Last, All-Day Comfort, 12 Pack",
}];

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

/**
 * Parse the last `result` event payload from an SSE Response stream.
 * The route emits `data: JSON\n\n` events; we collect them all and return
 * the last one with `type === "result"`.
 */
async function parseSseResult(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  const events = text
    .split("\n\n")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => {
      try { return JSON.parse(chunk.slice("data: ".length)); } catch { return null; }
    })
    .filter(Boolean) as Record<string, unknown>[];
  const result = events.filter((e) => e.type === "result").pop();
  if (!result) throw new Error("No result event found in SSE stream");
  return result;
}

const defaultAsins = [{
  asin: "B001", parentage_level: "parent", variation_product: "",
  variation_theme_name: "", flavor: null, style: null, color: null, size: null, existing_content: {},
}];
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

const bulletsResponse = [{
  ASIN: "B001",
  DetailedBulletPoint_1: "STRONG GRIP: Holds tight all day without slipping or bunching — premium widget design keeps everything in place so you can focus on what matters.",
  DetailedBulletPoint_2: "EASY SETUP: Ready in minutes with no tools needed — just unbox and you're good to go with this heavy duty solution.",
  DetailedBulletPoint_3: "BUILT TO LAST: Engineered for daily use in home office or job site environments — premium materials that won't let you down.",
  DetailedBulletPoint_4: "MULTI-USE DESIGN: Works indoors and out, hot or cold — the heavy duty build handles whatever you throw at it.",
  DetailedBulletPoint_5: "YOUR SIZE: Available in all sizes to fit every need — same premium widget quality across the board.",
  ConciseBulletPoint_1: "STRONG GRIP: All-day hold, no slip — premium widget performance.", ConciseBulletPoint_2: "EASY SETUP: Unbox and go — heavy duty and ready instantly.", ConciseBulletPoint_3: "BUILT TOUGH: Daily home office use, no wear.", ConciseBulletPoint_4: "MULTI-USE: Inside, outside, any weather.", ConciseBulletPoint_5: "FITS ALL: Every size, same quality.",
  ContentBulletPoint_1: "STRONG GRIP: Holds all day.", ContentBulletPoint_2: "EASY SETUP: No tools needed.", ContentBulletPoint_3: "DURABLE: Built to last.", ContentBulletPoint_4: "VERSATILE: Works anywhere.", ContentBulletPoint_5: "ALL SIZES: Perfect fit.",
  KeyFeaturesBulletPoint_1: "STRONG GRIP", KeyFeaturesBulletPoint_2: "EASY SETUP", KeyFeaturesBulletPoint_3: "DURABLE BUILD", KeyFeaturesBulletPoint_4: "MULTI-USE", KeyFeaturesBulletPoint_5: "ALL SIZES",
}];

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
    // Titles pipeline: generation (0) + humanize (1) + cmos (2) = 3 calls.
    // Must drain the SSE stream before checking mockFetch calls — processing is async.
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))      // 0. generation
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE)) // 1. humanize
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE));     // 2. cmos

    const res = await POST(makeRequest(titlesBody));
    await res.text(); // drain stream so background async work completes

    const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstCallBody.system).toContain("senior American consumer brand copywriter");
    expect(firstCallBody.system).toContain("CALIBRATION EXAMPLES");
    expect(firstCallBody.system).toContain("NEVER WRITE");
  });

  it("injects voice contract into bullets system prompt", async () => {
    // Bullets pipeline: generation (0) + humanize (1) + cmos (2) + coherence (3) = 4 calls.
    mockFetch
      .mockResolvedValueOnce(claudeResponse(bulletsResponse))     // 0. generation
      .mockResolvedValueOnce(claudeResponse(bulletsResponse))     // 1. humanize
      .mockResolvedValueOnce(claudeResponse(bulletsResponse))     // 2. cmos
      .mockResolvedValueOnce(claudeResponse(bulletsResponse));    // 3. coherence

    const res = await POST(makeRequest(bulletsBody));
    await res.text(); // drain stream

    const firstCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstCallBody.system).toContain("senior American consumer brand copywriter");
    expect(firstCallBody.system).toContain("CALIBRATION EXAMPLES");
  });
});

describe("humanization pass", () => {
  it("titles batch makes three Claude calls: generation, humanization, then cmos", async () => {
    // Titles: generation + humanize + cmos = 3 calls.
    // Auto-fix retry does NOT fire because test titles are ≤75 chars.
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))           // 0. generation
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE)) // 1. humanize
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE));          // 2. cmos

    const res = await POST(makeRequest(titlesBody));
    expect(res.status).toBe(200);
    await res.text(); // drain stream so async processing completes
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns humanized titles when humanization succeeds", async () => {
    // cmos must return HUMANIZED_TITLE_RESPONSE so it doesn't overwrite the humanized title
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))           // generation
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE)) // humanize
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE)); // cmos

    const res = await POST(makeRequest(titlesBody));
    const data = await parseSseResult(res);
    expect((data.rows as any[])[0].Title).toBe(HUMANIZED_TITLE_RESPONSE[0].Title);
  });

  it("returns original titles when humanization call fails", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))                         // generation
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve("Rate limit") }) // humanize fails
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE));                        // cmos

    const res = await POST(makeRequest(titlesBody));
    expect(res.status).toBe(200);
    const data = await parseSseResult(res);
    expect((data.rows as any[])[0].Title).toBe(TITLE_RESPONSE[0].Title);
  });

  it("returns original titles when humanization returns unparseable JSON", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))   // generation
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ content: [{ text: "not valid json at all" }], usage: {} }),
      })                                                        // humanize bad JSON
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE));  // cmos

    const res = await POST(makeRequest(titlesBody));
    expect(res.status).toBe(200);
    const data = await parseSseResult(res);
    expect((data.rows as any[])[0].Title).toBe(TITLE_RESPONSE[0].Title);
  });

  it("humanizer system prompt instructs to fix stiff phrasing without dropping keywords", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))           // generation
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE)) // humanize
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE));          // cmos

    const res = await POST(makeRequest(titlesBody));
    await res.text(); // drain stream so async processing completes

    const humanizeCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(humanizeCallBody.system).toContain("native American English");
    expect(humanizeCallBody.system).toContain("DO NOT CHANGE");
  });

  it("passes must-keep keywords to humanizer when usedKeywords provided", async () => {
    mockFetch
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE))           // generation
      .mockResolvedValueOnce(claudeResponse(HUMANIZED_TITLE_RESPONSE)) // humanize
      .mockResolvedValueOnce(claudeResponse(TITLE_RESPONSE));          // cmos

    const res = await POST(makeRequest({ ...titlesBody, usedKeywords: ["premium widget", "heavy duty"] }));
    await res.text(); // drain stream

    const humanizeCallBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(humanizeCallBody.messages[0].content).toContain("premium widget");
    expect(humanizeCallBody.messages[0].content).toContain("heavy duty");
  });

  it("bullets batch makes four Claude calls: generation, humanization, cmos, coherence", async () => {
    // Bullets pipeline: generation + humanize + cmos + coherence = 4 calls
    mockFetch
      .mockResolvedValueOnce(claudeResponse(bulletsResponse))  // generation
      .mockResolvedValueOnce(claudeResponse(bulletsResponse))  // humanize
      .mockResolvedValueOnce(claudeResponse(bulletsResponse))  // cmos
      .mockResolvedValueOnce(claudeResponse(bulletsResponse)); // coherence

    const res = await POST(makeRequest(bulletsBody));
    expect(res.status).toBe(200);
    await res.text(); // drain stream so async processing completes
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("normalizes ALL-CAPS ItemHighlight with colon to Title-Case without colon", async () => {
    // ItemHighlight with ALL-CAPS and a colon — toTitleCase must lower first then re-capitalize.
    // humanize/cmos do NOT touch ItemHighlight (not in HUMANIZE_FIELDS.titles),
    // so whatever generation returns flows straight to the normalization block.
    const allCapsResponse = [{ ASIN: "B001", Title: "Premium Widget - Heavy Duty Home Office", ItemHighlight: "BREATHABLE MESH: ALL-DAY COMFORT" }];
    mockFetch
      .mockResolvedValueOnce(claudeResponse(allCapsResponse))      // generation
      .mockResolvedValueOnce(claudeResponse(allCapsResponse))      // humanize (Title only)
      .mockResolvedValueOnce(claudeResponse(allCapsResponse));     // cmos (Title only)

    const res = await POST(makeRequest(titlesBody));
    const data = await parseSseResult(res);
    const ih = (data.rows as any[])[0].ItemHighlight as string;
    expect(ih).toBeTruthy();
    // Colon must be stripped
    expect(ih).not.toContain(":");
    // Must not be all-caps anymore
    expect(ih).not.toBe(ih.toUpperCase());
    // Must start with a capital letter (Title-Case)
    expect(ih).toMatch(/^[A-Z]/);
    // Should be "Breathable Mesh All-Day Comfort"
    expect(ih).toBe("Breathable Mesh All-Day Comfort");
  });

  it("trims ItemHighlight that exceeds 125 chars and keeps it non-empty", async () => {
    // >125-char ItemHighlight must be trimmed to ≤125 chars.
    const longIh = "Breathable Mesh, ".repeat(10); // 170 chars
    const longIhResponse = [{ ASIN: "B001", Title: "Premium Widget - Heavy Duty Home Office", ItemHighlight: longIh }];
    mockFetch
      .mockResolvedValueOnce(claudeResponse(longIhResponse))      // generation
      .mockResolvedValueOnce(claudeResponse(longIhResponse))      // humanize (Title only)
      .mockResolvedValueOnce(claudeResponse(longIhResponse));     // cmos (Title only)

    const res = await POST(makeRequest(titlesBody));
    const data = await parseSseResult(res);
    const ih = (data.rows as any[])[0].ItemHighlight as string;
    expect(ih).toBeTruthy();
    expect(ih.length).toBeLessThanOrEqual(125);
  });
});
