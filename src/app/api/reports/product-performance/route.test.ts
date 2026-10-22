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
  const url = new URL("http://localhost/api/reports/product-performance");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("GET /api/reports/product-performance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ products: [] });

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    const json = await res.json();

    expect(json).toEqual({ products: [] });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{
      asin: "B001", product_title: "Test Product",
      ad_spend: "10", ad_revenue: "20", impressions: "100",
      clicks: "5", units: "3", orders: "2",
    }]);

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.products[0]).toMatchObject({
      asin: "B001", adRevenue: 20, orders: 2, units: 3,
    });
    const sql = (queryRedshift as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toMatch(/advertised_product_summary/);
    expect(sql).toMatch(/ad_orders/);
    expect(sql).toMatch(/ad_conversions/);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-product-performance-v2",
      "1|2026-04-01|2026-04-30",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache and re-queries Redshift", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ stale: true });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{
      asin: "B001", product_title: "Test Product",
      ad_spend: "10", ad_revenue: "20", impressions: "100",
      clicks: "5", units: "3", orders: "2",
    }]);

    await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30", refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
