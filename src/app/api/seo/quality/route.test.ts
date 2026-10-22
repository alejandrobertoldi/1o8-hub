import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb, mockedGetAuthSession } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "from", "where", "orderBy", "limit", "insert", "update", "set", "values", "returning", "execute", "leftJoin"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods resolve promises
  chain.orderBy = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  chain.execute = vi.fn().mockResolvedValue([]);

  return {
    mockDb: chain,
    mockedGetAuthSession: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  seoQualityScores: { projectId: "project_id", createdAt: "created_at" },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));

import { GET, POST } from "./route";

const mockSession = { user: { email: "test@marketfoundry.agency", role: "admin" } };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/seo/quality", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET(new NextRequest("http://localhost/api/seo/quality?projectId=abc"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectId is missing", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await GET(new NextRequest("http://localhost/api/seo/quality"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("projectId required");
  });

  it("returns scores for valid projectId", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const fakeScores = [{ id: "1", projectId: "abc", overallScore: 85 }];
    mockDb.orderBy.mockResolvedValueOnce(fakeScores);
    const res = await GET(new NextRequest("http://localhost/api/seo/quality?projectId=abc"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeScores);
  });
});

describe("POST /api/seo/quality", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/seo/quality", {
      method: "POST", body: JSON.stringify({ projectId: "abc", overallScore: 85 }),
    }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectId is missing", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await POST(new NextRequest("http://localhost/api/seo/quality", {
      method: "POST", body: JSON.stringify({ overallScore: 85 }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("projectId and overallScore required");
  });

  it("returns 400 when overallScore is missing", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await POST(new NextRequest("http://localhost/api/seo/quality", {
      method: "POST", body: JSON.stringify({ projectId: "abc" }),
    }));
    expect(res.status).toBe(400);
  });

  it("persists score and returns it on success", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const saved = { id: "1", projectId: "abc", overallScore: 85 };
    mockDb.returning.mockResolvedValueOnce([saved]);
    const res = await POST(new NextRequest("http://localhost/api/seo/quality", {
      method: "POST", body: JSON.stringify({ projectId: "abc", overallScore: 85.7, complianceScore: 90.2 }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("1");
  });
});
