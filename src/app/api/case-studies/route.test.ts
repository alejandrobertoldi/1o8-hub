// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
const exec = vi.fn();
const insertValues = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({
  insert: () => ({ values: (v: unknown) => { insertValues(v); return { returning: () => Promise.resolve([{ id: "new-id" }]) }; } }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    execute: (...a: unknown[]) => exec(...a),
    transaction: (...a: Parameters<typeof transaction>) => transaction(...a),
  },
}));
const pull = vi.fn();
vi.mock("@/lib/case-study/kit/pull", () => ({ pullEverything: (...a: unknown[]) => pull(...a) }));
const loadAll = vi.fn();
vi.mock("@/lib/case-study/kit/load", () => ({ loadCaseStudyFor: vi.fn().mockResolvedValue(null), blockersFor: () => [],
  loadAllCaseStudies: (...a: unknown[]) => loadAll(...a) }));

import { getAuthSession } from "@/lib/auth-db";
import { GET, POST } from "./route";
import { EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { emptyMetrics } from "@/lib/case-study/kit/metrics";
const session = getAuthSession as unknown as ReturnType<typeof vi.fn>;
const req = (url: string, body?: unknown) => new NextRequest(`http://x${url}`, body ? { method: "POST", body: JSON.stringify(body) } : undefined);

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { role: "editor", id: "u1" } });
  pull.mockResolvedValue({ metrics: emptyMetrics("2025-10-01", "2026-09-30"), design: EMPTY_DESIGN_IMAGES, noAccount: true });
});

describe("GET tracker", () => {
  it("403 for client role", async () => {
    session.mockResolvedValue({ user: { role: "client" } });
    expect((await GET(req("/api/case-studies"))).status).toBe(403);
  });
  it("returns one row per active client with both cells", async () => {
    exec.mockResolvedValue([{ client_id_code: "A_SC_US", client_name: "Alpha" }, { client_id_code: "B_SC_US", client_name: "Beta" }]);
    loadAll.mockResolvedValue([{ id: "cs1", clientIdCode: "A_SC_US", format: "high_level", stage: "in_review", ownerName: "Sam",
      dateRangeStart: "2025-10-01", dateRangeEnd: "2026-09-30", updatedAt: "2026-09-28T00:00:00Z", sections: [] }]);
    const rows = await (await GET(req("/api/case-studies"))).json();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ clientIdCode: "A_SC_US", clientName: "Alpha", detailed: null,
      highLevel: { id: "cs1", stage: "in_review", ownerName: "Sam" } });
    expect(rows[1]).toMatchObject({ clientIdCode: "B_SC_US", highLevel: null, detailed: null });
  });
});

describe("POST create", () => {
  const good = { clientIdCode: "A_SC_US", format: "high_level", dateRangeStart: "2025-10-01", dateRangeEnd: "2026-09-30" };
  it("403 for viewer", async () => {
    session.mockResolvedValue({ user: { role: "viewer" } });
    expect((await POST(req("/api/case-studies", good))).status).toBe(403);
  });
  it.each([
    [{ ...good, format: "big" }], [{ ...good, dateRangeStart: "2025/10/01" }],
    [{ ...good, dateRangeEnd: "2025-01-01" }], [{ ...good, clientIdCode: "" }],
  ])("400 on bad input %#", async (body) => {
    expect((await POST(req("/api/case-studies", body))).status).toBe(400);
  });
  it("409 when that client+format exists", async () => {
    exec.mockResolvedValue([{ id: "exists" }]);
    expect((await POST(req("/api/case-studies", good))).status).toBe(409);
  });
  it("creates the deck with one section per High-Level slide, even with no Intentwise account", async () => {
    exec.mockImplementation((q: unknown) => Promise.resolve(JSON.stringify(q).includes("client_name") ? [{ client_name: "Alpha" }] : []));
    const res = await POST(req("/api/case-studies", good));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "new-id", noAccount: true });
    const [csRow, sectionRows] = insertValues.mock.calls.map((c) => c[0]);
    expect(csRow).toMatchObject({ clientIdCode: "A_SC_US", format: "high_level", stage: "drafting", ownerId: "u1", title: "Alpha — High-Level Case Study" });
    expect((sectionRows as { sectionType: string }[]).map((s) => s.sectionType)).toEqual(["hl_cover", "hl_challenge", "hl_results", "hl_approach", "hl_creative"]);
  });
  it("409 when a concurrent create wins the unique-index race", async () => {
    exec.mockImplementation((q: unknown) => Promise.resolve(JSON.stringify(q).includes("client_name") ? [{ client_name: "Alpha" }] : []));
    transaction.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("dup"), { code: "23505" })));
    const res = await POST(req("/api/case-studies", good));
    expect(res.status).toBe(409);
  });
  it("rethrows a non-unique-violation transaction error", async () => {
    exec.mockImplementation((q: unknown) => Promise.resolve(JSON.stringify(q).includes("client_name") ? [{ client_name: "Alpha" }] : []));
    transaction.mockImplementationOnce(() => Promise.reject(Object.assign(new Error("boom"), { code: "42601" })));
    await expect(POST(req("/api/case-studies", good))).rejects.toThrow("boom");
  });
});
