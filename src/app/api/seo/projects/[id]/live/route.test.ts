import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  loadVersionTexts: vi.fn(),
  loadRowsForAsins: vi.fn(),
  applyPlan: vi.fn(),
  project: { id: "P", name: "REA_SC_US_01_ReadyRESCUE_v01", clientIdCode: "REA_SC_US", status: "in_progress" } as Record<string, unknown> | null,
  projectAsins: ["A1", "A2"],
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: h.getAuthSession }));
vi.mock("@/lib/seo-projects-cache", () => ({ invalidateSeoProjectsCache: vi.fn() }));
vi.mock("@/lib/seo/asin-live-data", () => ({
  loadVersionTexts: h.loadVersionTexts,
  loadRowsForAsins: h.loadRowsForAsins,
  versionKey: (a: string, v: number) => `${a}|${v}`,
}));
vi.mock("./live-db", () => ({
  getProject: async () => h.project,
  getProjectAsins: async () => h.projectAsins,
  applyPlan: h.applyPlan,
  describeProjectAsins: async () => ({ asins: [], liveCount: 0, total: 2 }),
}));

import { GET, POST, DELETE } from "./route";

const ctx = { params: Promise.resolve({ id: "P" }) };
const req = (method: string, body?: unknown) =>
  new NextRequest("http://x/api/seo/projects/P/live", { method, body: body !== undefined ? JSON.stringify(body) : undefined });

beforeEach(() => {
  vi.clearAllMocks();
  h.project = { id: "P", name: "REA_SC_US_01_ReadyRESCUE_v01", clientIdCode: "REA_SC_US", status: "in_progress" };
  h.projectAsins = ["A1", "A2"];
  h.getAuthSession.mockResolvedValue({ user: { role: "editor" } });
  h.loadRowsForAsins.mockResolvedValue([]);
  h.loadVersionTexts.mockResolvedValue(new Map([["A1|1", {}], ["A2|1", {}]]));
  h.applyPlan.mockResolvedValue("live");
});

describe("POST live", () => {
  it("viewer → 403", async () => {
    h.getAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    expect((await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx)).status).toBe(403);
  });
  it("bad date → 400", async () => {
    expect((await POST(req("POST", { asins: ["A1"], liveDate: "1999-01-01" }), ctx)).status).toBe(400);
  });
  it("body is JSON null → 400 (M4)", async () => {
    expect((await POST(req("POST", null), ctx)).status).toBe(400);
  });
  it("project name without _vNN → 400", async () => {
    h.project = { id: "P", name: "Coffee SEO", clientIdCode: "TRT_SC_US" };
    expect((await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx)).status).toBe(400);
  });
  it("ASIN not in project → 400", async () => {
    expect((await POST(req("POST", { asins: ["ZZ"], liveDate: "2026-06-02" }), ctx)).status).toBe(400);
  });
  it("missing export → 409 with the ASIN list, nothing written", async () => {
    h.loadVersionTexts.mockResolvedValue(new Map([["A1|1", {}]]));
    const res = await POST(req("POST", { asins: ["A1", "A2"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).missing).toEqual(["A2"]);
    expect(h.applyPlan).not.toHaveBeenCalled();
  });
  it("BigQuery failure → 502 without raw error text", async () => {
    h.loadVersionTexts.mockRejectedValue(new Error("secret BQ detail"));
    const res = await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
  // I1: drizzle 0.45 wraps the real Postgres error in DrizzleQueryError, so the
  // 23505 code lives on `.cause.code`, never on the error itself.
  it("unique-live race, wrapped DrizzleQueryError shape → 409 (I1)", async () => {
    h.applyPlan.mockRejectedValue(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }));
    const res = await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(409);
  });
  it("unique-live race, top-level code shape → 409 (I1)", async () => {
    h.applyPlan.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await POST(req("POST", { asins: ["A1"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(409);
  });
  it("happy path → 200", async () => {
    const res = await POST(req("POST", { asins: ["A1", "A2"], liveDate: "2026-06-02" }), ctx);
    expect(res.status).toBe(200);
    expect(h.applyPlan).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE live", () => {
  it("empty asins → 400", async () => {
    expect((await DELETE(req("DELETE", { asins: [] }), ctx)).status).toBe(400);
  });
  it("body is JSON null → 400 (M4)", async () => {
    expect((await DELETE(req("DELETE", null), ctx)).status).toBe(400);
  });
  // M3: no rows exist for these ASINs on this project → planNotLive returns an
  // empty plan. The route must not write anything or re-derive the project's
  // status in that case — applyPlan must not be called at all, and the
  // project's actual (unrelated) status must come back unchanged.
  it("plan empty → applyPlan not called, current status returned (M3)", async () => {
    h.loadRowsForAsins.mockResolvedValue([]);
    const res = await DELETE(req("DELETE", { asins: ["A1"] }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "in_progress" });
    expect(h.applyPlan).not.toHaveBeenCalled();
  });
  it("happy path (own row exists) → 200, applyPlan called", async () => {
    h.loadRowsForAsins.mockResolvedValue([
      { projectId: "P", asin: "A1", status: "live", liveDate: "2026-06-02", deprecatedDate: null, deprecatedByProjectId: null, versionNumber: 1 },
    ]);
    const res = await DELETE(req("DELETE", { asins: ["A1"] }), ctx);
    expect(res.status).toBe(200);
    expect(h.applyPlan).toHaveBeenCalledTimes(1);
  });
  it("unique-live race, wrapped DrizzleQueryError shape → 409 (I1)", async () => {
    h.loadRowsForAsins.mockResolvedValue([
      { projectId: "P", asin: "A1", status: "live", liveDate: "2026-06-02", deprecatedDate: null, deprecatedByProjectId: null, versionNumber: 1 },
    ]);
    h.applyPlan.mockRejectedValue(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }));
    const res = await DELETE(req("DELETE", { asins: ["A1"] }), ctx);
    expect(res.status).toBe(409);
  });
});

describe("GET live", () => {
  it("unknown project → 404", async () => {
    h.project = null;
    expect((await GET(req("GET"), ctx)).status).toBe(404);
  });
});
