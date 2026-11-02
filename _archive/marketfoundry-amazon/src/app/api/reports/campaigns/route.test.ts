import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ user: { role: "admin" } }),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthOrCron: vi.fn().mockResolvedValue(null),
  getEffectiveAccountId: vi.fn().mockResolvedValue("1"),
}));
vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  buildDatedKey: vi.fn((a, s, e) => `${a}|${s}|${e}`),
}));

import { GET } from "./route";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { queryRedshift } from "@/lib/redshift";

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/reports/campaigns");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("GET /api/reports/campaigns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [], rowsByName: [] });

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    const json = await res.json();

    expect(json).toEqual({ rows: [], rowsByName: [] });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{
      campaign_type: "SP M KT", campaign_name: "Brand", ad_spend: "10", ad_revenue: "20",
      ad_clicks: "5", ad_impressions: "100", ad_conversions: "2",
      ad_orders: "8", ntb_orders: "2",
    }]);

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows[0].ntbPct).toBe(25);
    expect(json.rowsByName[0].orders).toBe(8);
    expect(json.rowsByName[0].ntbPct).toBe(25);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-campaigns-v2",
      "1|2026-04-01|2026-04-30",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache and re-queries Redshift", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ stale: true });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{
      campaign_type: "SP M KT", campaign_name: "Brand", ad_spend: "10", ad_revenue: "20",
      ad_clicks: "5", ad_impressions: "100", ad_conversions: "2",
      ad_orders: "8", ntb_orders: "2",
    }]);

    await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30", refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
