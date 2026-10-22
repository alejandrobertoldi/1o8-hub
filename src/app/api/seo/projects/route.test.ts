import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { invalidateSeoProjectsCache, writeSeoProjectsCache } from "@/lib/seo-projects-cache";

const { mockDb, mockedGetAuthSession, mockedRecycle } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "from", "where", "orderBy", "limit", "insert", "update", "set", "values", "returning", "execute", "leftJoin"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.orderBy = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  chain.execute = vi.fn().mockResolvedValue([]);

  return {
    mockDb: chain,
    mockedGetAuthSession: vi.fn(),
    mockedRecycle: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb, recycleDbPool: mockedRecycle }));
vi.mock("@/lib/db/schema", () => ({
  seoProjects: { id: "id", name: "name", brandName: "brand_name", status: "status", currentPhase: "current_phase", clientIdCode: "client_id_code", createdBy: "created_by", assignedTo: "assigned_to", createdAt: "created_at", updatedAt: "updated_at", s1ApprovedAt: "s1", s2ApprovedAt: "s2", s3ApprovedAt: "s3", s4ApprovedAt: "s4", s5ApprovedAt: "s5", s6ApprovedAt: "s6", linkedProductId: "linked_product_id" },
  seoAsins: { projectId: "project_id", generatedContent: "generated_content", asin: "asin" },
  seoExports: {},
  seoQualityScores: {},
  users: { id: "id", name: "name", image: "image" },
  variations: { id: "id", name: "name", code: "code" },
  master: { id: "id", asin: "asin", sku: "sku", parentAsin: "parent_asin", parentSku: "parent_sku", parentageLevel: "parentage_level", brandName: "brand_name", itemName: "item_name", summarizedTitle: "summarized_title", mainImageUrl: "main_image_url", clientIdCode: "client_id_code", contentSeo: "content_seo", genericKeywords: "generic_keywords", rawColumnValues: "raw_column_values", variationGroup: "variation_group", variations: "variations" },
  aac: { clientIdCode: "client_id_code", clientName: "client_name", rawData: "raw_data" },
  seoRevisions: { projectId: "project_id", status: "status" },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

import { GET, POST } from "./route";

const mockSession = { user: { email: "test@marketfoundry.agency", role: "admin" } };

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSeoProjectsCache();
  mockDb.orderBy.mockResolvedValue([]);
  mockDb.returning.mockResolvedValue([]);
});

describe("GET /api/seo/projects", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the project list", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb.orderBy.mockResolvedValueOnce([
      {
        id: "p1",
        name: "Alpha",
        brandName: "Brand",
        status: "draft",
        currentPhase: "S1",
        clientIdCode: "PURA",
        createdBy: "test@marketfoundry.agency",
        assignedTo: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        s1ApprovedAt: null,
        s2ApprovedAt: null,
        s3ApprovedAt: null,
        s4ApprovedAt: null,
        s5ApprovedAt: null,
        s6ApprovedAt: null,
        linkedProductId: null,
        variationId: null,
        version: 1,
        assigneeName: null,
        assigneeImage: null,
        variationName: null,
        variationCode: null,
      },
    ]);
    mockDb.where.mockResolvedValueOnce([]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Alpha");
    expect(body[0].content_preview).toBeNull();
    expect(body[0]).toHaveProperty("review_stage", null);
  });

  it("still returns 200 with review_stage null when the open-revision query fails", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb.orderBy.mockResolvedValueOnce([
      { id: "p1", name: "Alpha", brandName: "B", status: "draft", currentPhase: "S1", clientIdCode: "PURA", createdBy: "x", assignedTo: null, createdAt: new Date(), updatedAt: new Date(), s1ApprovedAt: null, s2ApprovedAt: null, s3ApprovedAt: null, s4ApprovedAt: null, s5ApprovedAt: null, s6ApprovedAt: null, linkedProductId: null, variationId: null, version: 1, assigneeName: null, assigneeImage: null, variationName: null, variationCode: null },
    ]);
    mockDb.where.mockRejectedValueOnce(new Error("relation seo_revisions does not exist"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    errSpy.mockRestore();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].review_stage).toBeNull();
  });

  it("serves the cached list on a second request without querying again", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb.orderBy.mockResolvedValueOnce([]);
    await GET();
    mockDb.orderBy.mockClear();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(mockDb.orderBy).not.toHaveBeenCalled();
  });

  it("recycles the pool and retries after a stall, then returns the list", async () => {
    vi.useFakeTimers();
    try {
      mockedGetAuthSession.mockResolvedValue(mockSession);
      mockDb.orderBy
        .mockReturnValueOnce(new Promise(() => {}))
        .mockResolvedValueOnce([]);

      const pending = GET();
      await vi.advanceTimersByTimeAsync(8_000);
      const res = await pending;

      expect(mockedRecycle).toHaveBeenCalledOnce();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a cached list immediately even if a background refresh hangs", async () => {
    writeSeoProjectsCache([{ id: "cached" }], Date.now() - 20_000);
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb.orderBy.mockReturnValue(new Promise(() => {}));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "cached" }]);
  });

  it("returns 503 when both attempts stall and there is no cache", async () => {
    vi.useFakeTimers();
    try {
      mockedGetAuthSession.mockResolvedValue(mockSession);
      mockDb.orderBy.mockReturnValue(new Promise(() => {}));

      const pending = GET();
      await vi.advanceTimersByTimeAsync(8_000);
      await vi.advanceTimersByTimeAsync(8_000);
      const res = await pending;

      expect(res.status).toBe(503);
      expect((await res.json()).error).toBe("Request timed out, please retry");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("POST /api/seo/projects", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/api/seo/projects", {
      method: "POST", body: JSON.stringify({ name: "New Project" }),
    }));
    expect(res.status).toBe(401);
  });

  it("creates a project and returns it", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const created = { id: "new-1", name: "New Project", brandName: "Brand", status: "draft", currentPhase: "S1", assignedTo: null };
    mockDb.returning.mockResolvedValueOnce([created]);
    const res = await POST(new NextRequest("http://localhost/api/seo/projects", {
      method: "POST", body: JSON.stringify({ name: "New Project", brand_name: "Brand" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("new-1");
    expect(body.status).toBe("draft");
  });
});
