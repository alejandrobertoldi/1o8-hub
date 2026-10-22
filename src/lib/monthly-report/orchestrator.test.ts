// src/lib/monthly-report/orchestrator.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./queries/account", () => ({
  fetchAccountRollup: vi.fn(),
  fetchRevenueSeries: vi.fn(),
  fetchDailySeries: vi.fn(),
  fetchCampaignDailySeries: vi.fn(),
}));
vi.mock("./queries/products", () => ({
  fetchProductRows: vi.fn(),
}));

import {
  fetchAccountRollup, fetchCampaignDailySeries, fetchDailySeries, fetchRevenueSeries,
} from "./queries/account";
import { fetchProductRows } from "./queries/products";
import { generateReport } from "./orchestrator";

const client = { name: "Dr. Cuddles", accountId: "1899670", slug: "dr-cuddles" };
const period = {
  period: "2026-03", start: "2026-03-01", end: "2026-03-31",
  prevStart: "2026-02-01", prevEnd: "2026-02-28", label: "March 2026",
};

describe("generateReport", () => {
  beforeEach(() => {
    vi.mocked(fetchAccountRollup).mockReset();
    vi.mocked(fetchRevenueSeries).mockReset();
    vi.mocked(fetchDailySeries).mockReset();
    vi.mocked(fetchCampaignDailySeries).mockReset();
    vi.mocked(fetchProductRows).mockReset();
    vi.mocked(fetchDailySeries).mockResolvedValue([]);
    vi.mocked(fetchCampaignDailySeries).mockResolvedValue([]);
  });

  it("returns a Report matching the template contract", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue({
      product_sales: 124000, product_quantity: 2800, total_order_items: 3000, ad_revenue: 0, ad_spend: 0,
      browser_sessions: 0, mobile_sessions: 0, ad_impressions: 0,
    });
    vi.mocked(fetchRevenueSeries).mockResolvedValue([
      { month: "OCT", revenue: 80000 }, { month: "NOV", revenue: 85000 }, { month: "DEC", revenue: 95000 },
      { month: "JAN", revenue: 90000 }, { month: "FEB", revenue: 100000 }, { month: "MAR", revenue: 124000 },
    ]);
    vi.mocked(fetchProductRows).mockResolvedValue([
      { asin: "A1", parent_asin: "P1", title: "Kit", sku: "SKU-A", sessions: 100, units: 50, sales: 2000, order_items: 55 } as any,
    ]);

    const payload = await generateReport(client, period, {
      enabled: { kpis: true, mom: true, highlights: true, products: true, goals: true, risks: true, appendix: true },
    });
    expect(payload.report.meta.client).toBe("Dr. Cuddles");
    expect(payload.report.sections).toContain("products");
    expect(payload.skipped).not.toContain("products");
    expect(payload.headline).not.toBeNull();
    expect(payload.report.meta.lead).toBe("Manu Lancharro");
  });

  it("uses the client's account manager on the cover", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue(null);
    vi.mocked(fetchRevenueSeries).mockResolvedValue([]);
    const payload = await generateReport(
      { ...client, accountManager: "Alex Moreno" },
      period,
      { enabled: { kpis: true, mom: true, highlights: true, products: false, goals: true, risks: true, appendix: true } },
    );
    expect(payload.report.meta.lead).toBe("Alex Moreno");
  });

  it("marks 'products' as skipped when config disables it", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue(null);
    vi.mocked(fetchRevenueSeries).mockResolvedValue([]);

    const payload = await generateReport(client, period, {
      enabled: { kpis: true, mom: true, highlights: true, products: false, goals: true, risks: true, appendix: true },
    });
    expect(payload.skipped).toContain("products");
    expect(vi.mocked(fetchProductRows)).not.toHaveBeenCalled();
  });

  it("fetches daily series for current and prior-year windows and surfaces compareSales", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue(null);
    vi.mocked(fetchRevenueSeries).mockResolvedValue([]);
    vi.mocked(fetchDailySeries)
      .mockResolvedValueOnce([
        { day: 1, sales: 200, units: 5, orderItems: 4 },
        { day: 2, sales: 150, units: 4, orderItems: 3 },
      ])
      .mockResolvedValueOnce([{ day: 1, sales: 100, units: 3, orderItems: 2 }]);

    const payload = await generateReport(client, period, {
      enabled: { kpis: true, mom: true, highlights: true, products: false, goals: true, risks: true, appendix: true },
    });

    const calls = vi.mocked(fetchDailySeries).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["1899670", "2026-03-01", "2026-03-31"]);
    expect(calls[1]).toEqual(["1899670", "2025-03-01", "2025-03-31"]);

    expect(payload.report.compareSales).toBeDefined();
    expect(payload.report.compareSales!.currentLabel).toBe("Mar 2026");
    expect(payload.report.compareSales!.previousLabel).toBe("Mar 2025");
    expect(payload.report.compareSales!.sales).toHaveLength(31);
    expect(payload.report.compareSales!.sales[0]).toEqual({ label: "1", value: 200 });
    expect(payload.report.compareSales!.salesPrev[0]).toEqual({ label: "1", value: 100 });
    expect(payload.report.compareSales!.salesPrev[1]).toEqual({ label: "2", value: 0 });
  });

  it("fetches campaign daily series for the current period and surfaces campaigns", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue(null);
    vi.mocked(fetchRevenueSeries).mockResolvedValue([]);
    vi.mocked(fetchCampaignDailySeries).mockResolvedValue([
      { day: 1, impressions: 12000, spend: 50.25, revenue: 200.50 },
      { day: 2, impressions: 8500,  spend: 42.10, revenue: 150.00 },
    ]);

    const payload = await generateReport(client, period, {
      enabled: { kpis: true, mom: true, highlights: true, products: false, goals: true, risks: true, appendix: true },
    });

    const calls = vi.mocked(fetchCampaignDailySeries).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["1899670", "2026-03-01", "2026-03-31"]);
    expect(calls[1]).toEqual(["1899670", "2026-02-01", "2026-02-28"]);

    expect(payload.report.campaigns).toBeDefined();
    expect(payload.report.campaigns!.dateRange).toBe("Mar 1 - Mar 31, 2026");
    expect(payload.report.campaigns!.series.totalSales).toHaveLength(31);
    expect(payload.report.campaigns!.series.adSpend).toHaveLength(31);
    expect(payload.report.campaigns!.series.adRevenue).toHaveLength(31);
    expect(payload.report.campaigns!.series.acos).toHaveLength(31);
    expect(payload.report.campaigns!.series.adSpend[0]).toEqual({ label: "1", value: 50.25 });
    expect(payload.report.campaigns!.series.adSpend[2]).toEqual({ label: "3", value: 0 });
    expect(payload.report.campaigns!.stats.map(s => s.label)).toEqual([
      "Total Sales", "Ad Spend", "Ad Revenue", "ACoS",
    ]);
  });

  it("omits campaigns section when ad metrics are all zero", async () => {
    vi.mocked(fetchAccountRollup).mockResolvedValue(null);
    vi.mocked(fetchRevenueSeries).mockResolvedValue([]);
    vi.mocked(fetchCampaignDailySeries).mockResolvedValue([
      { day: 1, impressions: 0, spend: 0, revenue: 0 },
    ]);

    const payload = await generateReport(client, period, {
      enabled: { kpis: true, mom: true, highlights: true, products: false, goals: true, risks: true, appendix: true },
    });
    expect(payload.report.campaigns).toBeUndefined();
    expect(payload.report.sections).not.toContain("campaigns");
  });
});
