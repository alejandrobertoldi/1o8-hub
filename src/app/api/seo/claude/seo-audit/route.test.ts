import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockFetch = vi.fn();

const { mockedGetAuthSession, mockedGetAiFeatureConfig, mockedGetConfigDocBlock, mockedLogEvent } = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedGetAiFeatureConfig: vi.fn(),
  mockedGetConfigDocBlock: vi.fn(),
  mockedLogEvent: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/ai-config.server", () => ({ getAiFeatureConfig: mockedGetAiFeatureConfig }));
vi.mock("@/lib/seo-config-doc", () => ({ getConfigDocBlock: mockedGetConfigDocBlock }));
vi.mock("@/lib/event-logger", () => ({ logEvent: mockedLogEvent }));

// Mock global fetch for Claude API calls
vi.stubGlobal("fetch", mockFetch);

import { POST } from "./route";

const mockSession = { user: { email: "test@marketfoundry.agency", name: "Test" } };
const aiConfig = { enabled: true, model: "claude-haiku-4-5-20251001", maxTokens: 8192 };

const validAuditResponse = {
  complianceScore: 85,
  keywordCoverage: 72,
  cosmoDensity: 68,
  rufusCoverage: 80,
  humanVoice: 90,
  buyerJourney: 75,
  variationConsistency: 88,
  eeatScore: 65,
  readabilityScore: 82,
  citabilityScore: 70,
  geoScore: 60,
  overallScore: 75,
  findings: [
    {
      severity: "warning",
      category: "eeat",
      asin: "B0XXXXX",
      field: "DetailedBulletPoint_3",
      detail: "Bullet 3 reads as feature list",
      suggestion: "Lead with benefit",
      batch: "bullets",
    },
  ],
  remediation: {
    titles: null,
    bullets: "Strengthen E-E-A-T in bullet 3",
    description: null,
    backend: null,
  },
};

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/seo/claude/seo-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const defaultBody = {
  brandName: "TestBrand",
  rows: [{ ASIN: "B0XXXXX", ParentageLevel: "parent", Title: "Test Product Title", DetailedBulletPoint_1: "Test bullet", ProductDescription: "Test desc", BackendSearchTerms: "test terms" }],
  keywords: [{ KeywordText: "test keyword", KeywordPriorityTier: "T1", SearchVolume: 1000 }],
  cosmo: [{ COSMORelationType: "USED_FOR_FUNC", COSMOMappedValue: "testing", COSMOAppliedPDPSection1: "Title" }],
  rufus: [{ RufusQuestion: "What is this?", RufusAnswer: "A test product" }],
  reviews: [{ ReviewTheme: "Quality", ReviewRufusUsableInsight: "Great quality" }],
  guidelines: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAuthSession.mockResolvedValue(mockSession);
  mockedGetAiFeatureConfig.mockResolvedValue(aiConfig);
  mockedGetConfigDocBlock.mockResolvedValue(null);
});

describe("POST /api/seo/claude/seo-audit", () => {
  it("returns 500 when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("ANTHROPIC_API_KEY");
  });

  it("returns 403 when feature is disabled", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockedGetAiFeatureConfig.mockResolvedValue({ ...aiConfig, enabled: false });
    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(403);
  });

  it("parses audit response with all 12 scores including geoScore", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    // Mock Call 1: Score response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify(validAuditResponse) }],
        usage: { input_tokens: 100, output_tokens: 200 },
      }),
    });

    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.geoScore).toBe(60);
    expect(data.overallScore).toBe(75);
    expect(data.eeatScore).toBe(65);
    expect(data.readabilityScore).toBe(82);
    expect(data.citabilityScore).toBe(70);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0].asin).toBe("B0XXXXX");
    expect(data.findings[0].field).toBe("DetailedBulletPoint_3");
  });

  it("handles markdown-fenced JSON in response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: "```json\n" + JSON.stringify(validAuditResponse) + "\n```" }],
        usage: {},
      }),
    });

    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.overallScore).toBe(75);
  });

  it("returns empty findings array gracefully", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const noFindings = { ...validAuditResponse, findings: [] };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify(noFindings) }],
        usage: {},
      }),
    });

    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.findings).toEqual([]);
    // No rewrite call should be made since no warning+ findings
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("triggers rewrite call for warning+ findings", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    // Call 1: Score
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify(validAuditResponse) }],
        usage: {},
      }),
    });

    // Call 2: Rewrite
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify([{ index: 0, rewrite: "IMPROVED BULLET: Better content here" }]) }],
        usage: {},
      }),
    });

    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.findings[0].rewrite).toBe("IMPROVED BULLET: Better content here");
    expect(mockFetch).toHaveBeenCalledTimes(2); // Score + Rewrite
  });

  it("still returns scores when rewrite call fails", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    // Call 1: Score succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify(validAuditResponse) }],
        usage: {},
      }),
    });

    // Call 2: Rewrite fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve("Rate limit exceeded"),
    });

    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.overallScore).toBe(75);
    expect(data.findings[0].rewrite).toBeUndefined(); // No rewrite since call failed
  });

  it("handles missing geoScore in response gracefully", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const noGeo = { ...validAuditResponse };
    delete (noGeo as any).geoScore;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        content: [{ text: JSON.stringify(noGeo) }],
        usage: {},
      }),
    });

    const res = await POST(makeRequest(defaultBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.geoScore).toBeUndefined();
    expect(data.overallScore).toBe(75); // Other scores still work
  });
});
