import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb, mockedGetAuthSession } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "from", "where", "orderBy", "limit", "insert", "update", "set", "values", "returning", "execute", "leftJoin"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.orderBy = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  chain.execute = vi.fn().mockResolvedValue([]);
  chain.where = vi.fn().mockResolvedValue(undefined);
  chain.limit = vi.fn().mockResolvedValue([]);

  return {
    mockDb: chain,
    mockedGetAuthSession: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  seoProjects: { id: "id", s6ApprovedAt: "s6_approved_at", status: "status", updatedAt: "updated_at", assignedTo: "assigned_to", brandName: "brand_name" },
  seoAsins: { projectId: "project_id", asin: "asin", parentageLevel: "parentage_level", variationProduct: "variation_product", flavor: "flavor", style: "style", color: "color", size: "size", generatedContent: "generated_content" },
  seoExports: { projectId: "project_id" },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/seo-docx-builder", () => ({
  buildDocxBuffer: vi.fn().mockResolvedValue(Buffer.from("fake")),
}));
vi.mock("@/lib/drive-client", () => ({
  driveClient: {
    listFiles: vi.fn().mockResolvedValue({ files: [] }),
    createFolder: vi.fn().mockResolvedValue({ id: "folder-1" }),
    uploadFile: vi.fn().mockResolvedValue({ id: "file-1" }),
    deleteFile: vi.fn(),
  },
}));

import { PATCH } from "./route";

const mockSession = { user: { email: "test@marketfoundry.agency", role: "admin" } };

beforeEach(() => vi.clearAllMocks());

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/seo/projects/bulk", {
    method: "PATCH", body: JSON.stringify(body),
  });
}

describe("PATCH /api/seo/projects/bulk", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await PATCH(patchReq({ action: "approve", projectIds: ["1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectIds is empty", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await PATCH(patchReq({ action: "approve", projectIds: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("projectIds array required");
  });

  it("returns 400 when projectIds is not an array", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await PATCH(patchReq({ action: "approve", projectIds: "not-array" }));
    expect(res.status).toBe(400);
  });

  it("approves projects successfully", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await PATCH(patchReq({ action: "approve", projectIds: ["p1", "p2"] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("approve");
    expect(body.count).toBe(2);
  });

  it("returns 400 for reassign without assignTo", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await PATCH(patchReq({ action: "reassign", projectIds: ["p1"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("assignTo required for reassign");
  });

  it("reassigns projects successfully", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await PATCH(patchReq({ action: "reassign", projectIds: ["p1"], assignTo: "user-123" }));
    expect(res.status).toBe(200);
    expect((await res.json()).action).toBe("reassign");
  });

  it("returns 400 for unknown action", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    const res = await PATCH(patchReq({ action: "invalid", projectIds: ["p1"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown action/);
  });
});
