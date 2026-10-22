import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb, mockedGetAuthSession } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "where", "insert", "values", "onConflictDoUpdate", "returning", "delete"]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // GET route calls db.select().from(reportSectionConfig) — no .where() — so .from() must be awaitable.
  chain.from = vi.fn().mockResolvedValue([]);
  chain.returning = vi.fn().mockResolvedValue([]);
  return { mockDb: chain, mockedGetAuthSession: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  reportSectionConfig: { scope: "scope", scopeKey: "scope_key", sectionKey: "section_key", enabled: "enabled" },
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { GET, PUT } from "./route";

const admin = { user: { email: "a@marketfoundry.agency", role: "admin" } };

beforeEach(() => vi.clearAllMocks());

describe("GET /api/reports/monthly/config", () => {
  it("401 without session", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("403 for non-admin", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns global + client rows with default-on semantics", async () => {
    mockedGetAuthSession.mockResolvedValue(admin);
    mockDb.from.mockResolvedValueOnce([
      { scope: "global", scopeKey: "default", sectionKey: "products", enabled: false },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.global.products).toBe(false);
    expect(body.global.kpis).toBe(true); // default
    expect(body.clients).toEqual({});
  });
});

describe("PUT /api/reports/monthly/config", () => {
  function put(body: unknown) {
    return new NextRequest("http://localhost/api/reports/monthly/config", {
      method: "PUT",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });
  }

  it("401 / 403 checks", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    expect((await PUT(put({}))).status).toBe(401);
    mockedGetAuthSession.mockResolvedValue({ user: { role: "editor" } });
    expect((await PUT(put({}))).status).toBe(403);
  });

  it("rejects invalid section keys", async () => {
    mockedGetAuthSession.mockResolvedValue(admin);
    const res = await PUT(put({ global: { bogus: true }, clients: {} }));
    expect(res.status).toBe(400);
  });

  it("upserts global + client rows", async () => {
    mockedGetAuthSession.mockResolvedValue(admin);
    mockDb.onConflictDoUpdate.mockResolvedValue([]);
    const res = await PUT(
      put({
        global: { products: true, kpis: false },
        clients: { "1899670": { products: true } },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
