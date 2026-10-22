import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────

const { mockDb, mockTx, mockedGetAuthSession } = vi.hoisted(() => {
  // Call tracker — each select/from/where/limit sequence returns a queued value
  let queryQueue: unknown[] = [];
  let txQueryQueue: unknown[] = [];

  function makeChain(queue: unknown[]) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const passthrough = ["select", "from", "innerJoin", "insert", "values", "set"];
    for (const m of passthrough) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Terminal methods pull from queue
    chain.where = vi.fn().mockImplementation(() => {
      // Return chainable that has limit, but also is thenable (for no-limit queries)
      const result = queue.shift() ?? [];
      const sub = {
        limit: vi.fn().mockResolvedValue(result),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return sub;
    });
    chain.limit = vi.fn().mockImplementation(() => {
      return Promise.resolve(queue.shift() ?? []);
    });
    chain.returning = vi.fn().mockImplementation(() => {
      return Promise.resolve(queue.shift() ?? []);
    });
    chain.update = vi.fn().mockReturnValue(chain);
    return chain;
  }

  const dbChain = makeChain(queryQueue);
  const txChain = makeChain(txQueryQueue);

  // Transaction runs callback with txChain
  dbChain.transaction = vi.fn().mockImplementation(
    async (cb: (tx: typeof txChain) => Promise<unknown>) => cb(txChain)
  );

  // Expose queue push helpers
  (dbChain as Record<string, unknown>)._pushResult = (v: unknown) => queryQueue.push(v);
  (txChain as Record<string, unknown>)._pushResult = (v: unknown) => txQueryQueue.push(v);
  (dbChain as Record<string, unknown>)._resetQueue = () => { queryQueue = []; (dbChain as Record<string, unknown>).where = makeChain(queryQueue).where; };
  (txChain as Record<string, unknown>)._resetQueue = () => { txQueryQueue = []; (txChain as Record<string, unknown>).where = makeChain(txQueryQueue).where; };

  // Keep stable references but allow queue reset
  return {
    mockDb: { ...dbChain, _q: queryQueue, _pushResult: (v: unknown) => queryQueue.push(v) } as unknown as Record<string, ReturnType<typeof vi.fn>> & { _q: unknown[]; _pushResult: (v: unknown) => void },
    mockTx: { ...txChain, _q: txQueryQueue, _pushResult: (v: unknown) => txQueryQueue.push(v) } as unknown as Record<string, ReturnType<typeof vi.fn>> & { _q: unknown[]; _pushResult: (v: unknown) => void },
    mockedGetAuthSession: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  seoProjects: { id: "id", variationId: "variation_id", version: "version", updatedAt: "updated_at" },
  seoAsins: { projectId: "project_id", asin: "asin", variationGroup: "variation_group" },
  master: { id: "id", asin: "asin", clientIdCode: "client_id_code", variationRef: "variation_ref" },
  variations: { id: "id", name: "name", code: "code" },
  variationGroups: { id: "id", name: "name" },
  variationGroupAssignments: { groupId: "group_id", productId: "product_id" },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  inArray: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(vi.fn().mockReturnValue("sql"), {
    // Tagged template support
    [Symbol.for("tag")]: true,
  }),
}));

import { POST } from "./route";

const mockSession = { user: { email: "test@marketfoundry.agency", role: "admin" } };
const mockParams = { params: Promise.resolve({ id: "proj-1" }) };

function makeRequest() {
  return new NextRequest("http://localhost/api/seo/projects/proj-1/link-variation", {
    method: "POST",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset query queues by clearing arrays
  while (mockDb._q?.length) mockDb._q.pop();
  while (mockTx._q?.length) mockTx._q.pop();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("POST /api/seo/projects/[id]/link-variation", () => {
  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(401);
  });

  it("returns 404 when project not found", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    // project query → empty
    mockDb._pushResult([]);
    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Project not found");
  });

  it("returns 409 when project already linked", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb._pushResult([{ id: "proj-1", variationId: "var-1", clientIdCode: "CLI" }]);
    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Project already linked to a variation");
  });

  it("returns 400 when no seoAsins exist", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    // project
    mockDb._pushResult([{ id: "proj-1", variationId: null, clientIdCode: "CLI" }]);
    // seoAsins
    mockDb._pushResult([]);
    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No ASINs found in this project");
  });

  it("returns 400 when no products match in catalog", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb._pushResult([{ id: "proj-1", variationId: null, clientIdCode: "CLI" }]);
    mockDb._pushResult([{ asin: "B001", projectId: "proj-1" }]);
    // master products
    mockDb._pushResult([]);
    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No matching products found in catalog");
  });

  it("returns 400 when no products have a variationRef", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb._pushResult([{ id: "proj-1", variationId: null, clientIdCode: "CLI" }]);
    mockDb._pushResult([{ asin: "B001", projectId: "proj-1" }]);
    mockDb._pushResult([{ id: "prod-1", asin: "B001", variationRef: null }]);
    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("No products are assigned to a variation in the builder");
  });

  it("returns 400 when variation not found in DB", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb._pushResult([{ id: "proj-1", variationId: null, clientIdCode: "CLI" }]);
    mockDb._pushResult([{ asin: "B001", projectId: "proj-1" }]);
    mockDb._pushResult([{ id: "prod-1", asin: "B001", variationRef: "var-1" }]);
    // variation lookup
    mockDb._pushResult([]);
    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Matched variation not found");
  });

  it("links project to variation successfully (happy path)", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    // project
    mockDb._pushResult([{ id: "proj-1", variationId: null, clientIdCode: "CLI" }]);
    // seoAsins
    mockDb._pushResult([
      { asin: "B001", projectId: "proj-1" },
      { asin: "B002", projectId: "proj-1" },
    ]);
    // master products
    mockDb._pushResult([
      { id: "prod-1", asin: "B001", variationRef: "var-1" },
      { id: "prod-2", asin: "B002", variationRef: "var-1" },
    ]);
    // variation lookup
    mockDb._pushResult([{ id: "var-1", name: "My Var", code: "MV-001" }]);

    // Transaction queries:
    // 1. count existing projects on variation
    mockTx._pushResult([{ count: 0 }]);
    // 2. update seoProjects (via update().set().where())
    mockTx._pushResult(undefined);
    // 3. group assignments (for sync)
    mockTx._pushResult([]);

    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.variationId).toBe("var-1");
    expect(body.variationCode).toBe("MV-001");
    expect(body.version).toBe(1);
    expect(body.matchedProducts).toBe(2);
    expect(body.unmatchedAsins).toEqual([]);
  });

  it("reports unmatched ASINs and increments version", async () => {
    mockedGetAuthSession.mockResolvedValue(mockSession);
    mockDb._pushResult([{ id: "proj-1", variationId: null, clientIdCode: "CLI" }]);
    mockDb._pushResult([
      { asin: "B001", projectId: "proj-1" },
      { asin: "B002", projectId: "proj-1" },
      { asin: "B003", projectId: "proj-1" },
    ]);
    // Only 2 match in catalog
    mockDb._pushResult([
      { id: "prod-1", asin: "B001", variationRef: "var-1" },
      { id: "prod-2", asin: "B002", variationRef: "var-1" },
    ]);
    mockDb._pushResult([{ id: "var-1", name: "My Var", code: "MV-001" }]);

    // Transaction: 1 existing project on this variation
    mockTx._pushResult([{ count: 1 }]);
    mockTx._pushResult(undefined);
    mockTx._pushResult([]);

    const res = await POST(makeRequest(), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(2);
    expect(body.unmatchedAsins).toEqual(["B003"]);
    expect(body.matchedProducts).toBe(2);
  });
});
