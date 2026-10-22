import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb, tx, mockedGetAuthSession, mockedSelectTargets } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "from", "where", "limit", "delete", "insert", "values", "update", "set"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  const txChain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["delete", "insert", "values", "update", "set", "where"]) {
    txChain[m] = vi.fn().mockReturnValue(txChain);
  }
  chain.transaction = vi.fn(async (fn: (t: unknown) => Promise<void>) => fn(txChain));
  return { mockDb: chain, tx: txChain, mockedGetAuthSession: vi.fn(), mockedSelectTargets: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  seoProjects: { id: "id", clientIdCode: "client_id_code", s1ApprovedAt: "s1", updatedAt: "updated_at" },
  seoAsins: { projectId: "project_id" },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/seo-projects-cache", () => ({ invalidateSeoProjectsCache: vi.fn() }));
vi.mock("@/lib/seo/project-asin-rows", () => ({
  selectTargetProducts: mockedSelectTargets,
  buildSeoAsinRows: (projectId: string, products: { id: string }[]) => products.map((p) => ({ projectId, asin: p.id })),
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { PUT } from "./route";

const params = Promise.resolve({ id: "proj-1" });
const put = (body: unknown) =>
  PUT(new NextRequest("http://x/api/seo/projects/proj-1/targets", { method: "PUT", body: JSON.stringify(body) }), { params });

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAuthSession.mockResolvedValue({ user: { email: "a@b.c", role: "admin" } });
});

describe("PUT /api/seo/projects/[id]/targets", () => {
  it("rejects viewers", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    expect((await put({ product_ids: ["p1"] })).status).toBe(403);
  });

  it("rejects an empty selection", async () => {
    expect((await put({ product_ids: [] })).status).toBe(400);
  });

  it("refuses once S1 is approved (ASINs are locked)", async () => {
    mockDb.limit.mockResolvedValueOnce([{ clientIdCode: "REA_SC_US", s1ApprovedAt: new Date() }]);
    const res = await put({ product_ids: ["p1"] });
    expect(res.status).toBe(409);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects products from another client", async () => {
    mockDb.limit.mockResolvedValueOnce([{ clientIdCode: "REA_SC_US", s1ApprovedAt: null }]);
    mockedSelectTargets.mockResolvedValueOnce([{ id: "p1" }]); // p2 filtered out by client
    const res = await put({ product_ids: ["p1", "p2"] });
    expect(res.status).toBe(400);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("replaces the ASIN list in one transaction", async () => {
    mockDb.limit.mockResolvedValueOnce([{ clientIdCode: "REA_SC_US", s1ApprovedAt: null }]);
    mockedSelectTargets.mockResolvedValueOnce([{ id: "p1" }, { id: "p2" }]);
    const res = await put({ product_ids: ["p1", "p2", "p2"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, asin_count: 2 });
    expect(tx.delete).toHaveBeenCalled();
    expect(tx.values).toHaveBeenCalledWith([
      { projectId: "proj-1", asin: "p1" },
      { projectId: "proj-1", asin: "p2" },
    ]);
  });
});
