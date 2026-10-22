import { describe, it, expect, vi, beforeEach } from "vitest";

const { selectQueue, mockSession } = vi.hoisted(() => ({ selectQueue: [] as unknown[][], mockSession: vi.fn() }));

vi.mock("@/lib/db", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "from", "innerJoin", "leftJoin", "where", "orderBy"]) chain[m] = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve(selectQueue.shift() ?? []));
  return { db: chain };
});
vi.mock("@/lib/db/schema", () => ({
  seoProjects: { id: "id", name: "name" },
  seoRevisions: { id: "id", revisionNumber: "n", approvedAt: "a", finalVia: "f" },
  seoRevisionPushes: { createdAt: "c", pushedBy: "p", overrideReason: "o", projectId: "pid", revisionId: "rid", productId: "prod" },
  seoRevisionEvents: { revisionId: "rid", step: "step", action: "action", actorName: "an", createdAt: "c" },
}));
vi.mock("drizzle-orm", () => ({ desc: vi.fn(), eq: vi.fn(), and: vi.fn(), or: vi.fn() }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockSession }));

import { GET } from "./route";

const ctx = { params: Promise.resolve({ id: "M1" }) };
const req = {} as never;

beforeEach(() => { selectQueue.length = 0; mockSession.mockReset(); });

describe("GET /api/products/[id]/seo-revision", () => {
  it("adds approvedByName from the approving event", async () => {
    mockSession.mockResolvedValue({ user: { role: "admin" } });
    selectQueue.push([{ revisionId: "R3", projectId: "P1", projectName: "TRS" }], [{ actorName: "Maria" }]);
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).push.approvedByName).toBe("Maria");
  });
  it("returns push null when nothing was pushed", async () => {
    mockSession.mockResolvedValue({ user: { role: "admin" } });
    selectQueue.push([]);
    const res = await GET(req, ctx);
    expect(await res.json()).toEqual({ push: null });
  });
  it("override push has approvedByName null and skips the event query", async () => {
    mockSession.mockResolvedValue({ user: { role: "admin" } });
    selectQueue.push([{ revisionId: null, projectId: "P1" }]);
    const res = await GET(req, ctx);
    expect((await res.json()).push.approvedByName).toBeNull();
  });
  it("403 for a client-role session", async () => {
    mockSession.mockResolvedValue({ user: { role: "client" } });
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });
});
