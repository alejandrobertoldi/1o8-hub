import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ user: { role: "admin" } }),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthOrCron: vi.fn().mockResolvedValue(null),
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
  const url = new URL("http://localhost/api/reports/advertising-audit");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const campaignTypeRow = {
  campaign_type: "SP M KT", ad_spend: 10, ad_revenue: 20,
  ad_clicks: 5, ad_impressions: 100, ad_conversions: 2,
  ad_orders: 2, ntb_orders: 1, ntb_ordered_units: 1, ntb_revenue: 5,
};
const campaignNameRow = {
  campaign_name: "Test Campaign", campaign_type: "SP M KT",
  ad_spend: 10, ad_revenue: 20, ad_clicks: 5, ad_impressions: 100,
  ad_conversions: 2, ad_orders: 2, ntb_orders: 1, ntb_ordered_units: 1, ntb_revenue: 5,
};
const dailyRow = { day: "2026-04-01", ad_spend: 10, ad_revenue: 20, ad_impressions: 100, ad_clicks: 5, ad_conversions: 2 };
const segRow = { brand_type: "Brand", ad_spend: 10, ad_revenue: 20, ad_clicks: 5, ad_impressions: 100, ad_conversions: 2, ad_orders: 1 };
const matchRow = { match_type: "exact", ad_spend: 10, ad_revenue: 20, ad_clicks: 5, ad_impressions: 100, ad_conversions: 2, ad_orders: 1 };
const gapRow = { product: "B001", product_title: "Test", sd_a: 0, sd_pt: 0, sp_a: 5, sp_m_kt: 10, sp_m_kt_pt: 0, sp_m_pt: 0 };

describe("GET /api/reports/advertising-audit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ campaignTypes: [], campaignNames: [] });

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    const json = await res.json();

    expect(json).toEqual({ campaignTypes: [], campaignNames: [] });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([campaignTypeRow])  // campaignTypeRows
      .mockResolvedValueOnce([campaignNameRow])  // campaignNameRows
      .mockResolvedValueOnce([dailyRow])          // dailyRows
      .mockResolvedValueOnce([segRow])            // spBrandRows
      .mockResolvedValueOnce([matchRow])          // spMatchRows
      .mockResolvedValueOnce([segRow])            // sbBrandRows
      .mockResolvedValueOnce([matchRow])          // sbMatchRows
      .mockResolvedValueOnce([gapRow]);           // gapsByAsinRows

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-advertising-audit",
      "1|2026-04-01|2026-04-30",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache and re-queries Redshift", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ stale: true });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([campaignTypeRow]);

    await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30", refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
