import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  getIntentwiseAccountId: vi.fn(),
  loadClientLiveRows: vi.fn(),
  loadVersionTexts: vi.fn(),
  loadS2Keywords: vi.fn(),
  loadAsinTermWindows: vi.fn(),
  loadSearchTerms: vi.fn(),
  loadKeywordInputs: vi.fn(),
  clientAsins: [] as string[],
  projectIds: [] as string[],
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: h.getAuthSession }));
vi.mock("@/lib/forecast-redshift", () => ({ getIntentwiseAccountId: h.getIntentwiseAccountId }));
vi.mock("@/lib/seo/asin-live-data", () => ({
  loadClientLiveRows: h.loadClientLiveRows,
  loadVersionTexts: h.loadVersionTexts,
  loadS2Keywords: h.loadS2Keywords,
  loadAsinTermWindows: h.loadAsinTermWindows,
  versionKey: (a: string, v: number) => `${a}|${v}`,
}));
vi.mock("@/lib/seo/ppc-status-data", () => ({ loadSearchTerms: h.loadSearchTerms, loadKeywordInputs: h.loadKeywordInputs }));
vi.mock("./client-scope", () => ({ loadClientScope: async () => ({ projectIds: h.projectIds, asins: h.clientAsins }) }));

import { GET } from "./route";

const call = (qs = "") => GET(new NextRequest(`http://x/api/seo/clients/REA_SC_US/ppc-status${qs}`), { params: Promise.resolve({ clientId: "REA_SC_US" }) });
const live = (asin: string, liveDate: string) => ({ projectId: "P", projectName: "REA_v01", asin, status: "live", liveDate, deprecatedDate: null, deprecatedByProjectId: null, versionNumber: 1 });
const text = { title: "Dog First Aid Kit for travel", bullets: "activated charcoal", description: "", backend: "" };

beforeEach(() => {
  vi.clearAllMocks();
  h.clientAsins = ["A1", "A2", "A3"];
  h.projectIds = ["P"];
  h.getAuthSession.mockResolvedValue({ user: { role: "editor" } });
  h.getIntentwiseAccountId.mockResolvedValue(1899670);
  h.loadClientLiveRows.mockResolvedValue([live("A1", "2026-06-02"), live("A2", "2099-01-01")]);
  h.loadVersionTexts.mockResolvedValue(new Map([["A1|1", text], ["A2|1", text]]));
  h.loadS2Keywords.mockResolvedValue(new Map([["P", [{ text: "dog first aid kit", tier: "T1" }, { text: "activated charcoal", tier: "T2" }, { text: "cat toy", tier: "T3" }]]]));
  h.loadAsinTermWindows.mockResolvedValue({ rows: [{ asin: "A1", search_term: "dog first aid kit", win: "after", ad_impressions: 30, ad_clicks: 3, ad_spend: 3, ad_revenue: 30, ad_orders: 1 }], shares: [{ asin: "A1", shared_with: 2 }], fetchedAt: new Date("2026-09-28T23:03:00Z") });
  h.loadSearchTerms.mockResolvedValue({ rows: [], fetchedAt: new Date("2026-09-28T22:00:00Z") });
  h.loadKeywordInputs.mockResolvedValue({ s6: [], s2: [] });
});

describe("GET ppc-status v2", () => {
  it("viewer → 403", async () => {
    h.getAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    expect((await call()).status).toBe(403);
  });
  it("one block per live ASIN, tracked keywords only, not-tracked list, shared note, oldest cachedAt", async () => {
    const body = await (await call("?window=30")).json();
    expect(body.blocks.map((b: { asin: string }) => b.asin)).toEqual(["A1", "A2"]);
    const a1 = body.blocks[0];
    expect(a1.rows.map((r: { keyword: string }) => r.keyword).sort()).toEqual(["activated charcoal", "dog first aid kit"]);
    expect(a1.sharedWith).toBe(2);
    expect(a1.advertised).toBe(true);
    expect(a1.totals.afterTotals.sales).toBe(30);
    expect(body.notTracked).toEqual(["A3"]);
    expect(body.cachedAt).toBe("2026-09-28T22:00:00.000Z");
  });
  it("future go-live → status future, no windows, no rows fetched for it (Review Focus 4)", async () => {
    const body = await (await call()).json();
    const a2 = body.blocks.find((b: { asin: string }) => b.asin === "A2");
    expect(a2.status).toBe("future");
    expect(a2.totals).toBeNull();
    const specs = h.loadAsinTermWindows.mock.calls[0][1];
    expect(specs.map((s: { asin: string }) => s.asin)).toEqual(["A1"]);
  });
  it("shares come from the loader (I2), not a separate Redshift call", async () => {
    await call();
    expect(h.loadAsinTermWindows).toHaveBeenCalledWith(1899670, expect.any(Array), ["A1", "A2"]);
  });
  it("O3: an ASIN with no shares row is not advertised", async () => {
    const body = await (await call()).json();
    expect(body.blocks.find((b: { asin: string }) => b.asin === "A2").advertised).toBe(false);
  });
  it("asin filter narrows blocks", async () => {
    const body = await (await call("?asin=A1")).json();
    expect(body.blocks.map((b: { asin: string }) => b.asin)).toEqual(["A1"]);
  });
  it("no PPC account → 200 accountId null, no Redshift", async () => {
    h.getIntentwiseAccountId.mockResolvedValue(null);
    const body = await (await call()).json();
    expect(body.accountId).toBeNull();
    expect(h.loadAsinTermWindows).not.toHaveBeenCalled();
  });
  it("BigQuery failure → 502 without raw text", async () => {
    h.loadVersionTexts.mockRejectedValue(new Error("secret"));
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
  it("Redshift failure → 502 without raw text", async () => {
    h.loadAsinTermWindows.mockRejectedValue(new Error("secret rs"));
    const res = await call();
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});
