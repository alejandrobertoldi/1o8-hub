// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const q = vi.fn();
vi.mock("@/lib/redshift", () => ({ queryRedshift: (...a: unknown[]) => q(...a) }));
import { pullRedshiftMetrics, channelOf, normaliseBuyBox } from "./pull-redshift";

const account = [
  { month: "2025-01", sales: 1000, units: 50, ad_sales: 300, ad_spend: 100, impressions: 9000, clicks: 90, ad_orders: 12, sessions: 800 },
  { month: "2025-02", sales: 2000, units: 80, ad_sales: 500, ad_spend: 150, impressions: 11000, clicks: 110, ad_orders: 20, sessions: 1200 },
];
const products = [
  { asin: "B1", sku: "s1", title: "Alpha", sales: 1800, units: 70, page_views: 1500, bb_num: 1800 * 95, bb_den: 1800 },
  { asin: "B1", sku: "s1b", title: "Alpha", sales: 200, units: 10, page_views: 100, bb_num: 200 * 85, bb_den: 200 },
  { asin: "B2", sku: "s2", title: "Beta", sales: 1000, units: 50, page_views: 900, bb_num: 1000 * 90, bb_den: 1000 },
  { asin: "B3", sku: "s3", title: "Gamma", sales: 0, units: 0, page_views: 10, bb_num: 0, bb_den: 0 },
];
const campaigns = [
  { month: "2025-01", campaign_type: "SP M KT", spend: 60, sales: 200, orders: 8 },
  { month: "2025-01", campaign_type: "SB M V", spend: 30, sales: 80, orders: 3 },
  { month: "2025-01", campaign_type: "SD A", spend: 10, sales: 20, orders: 1 },
  { month: "2025-02", campaign_type: "SP A", spend: 150, sales: 500, orders: 20 },
];

beforeEach(() => {
  q.mockReset();
  q.mockImplementation((sql: string) => {
    if (sql.includes("account_summary")) return Promise.resolve(account);
    if (sql.includes("product_summary")) return Promise.resolve(products);
    if (sql.includes("campaign_summary")) return Promise.resolve(campaigns);
    return Promise.resolve([]);
  });
});

describe("pullRedshiftMetrics", () => {
  it("maps account, products and campaigns", async () => {
    const { metrics: m, failed } = await pullRedshiftMetrics("123", "2025-01-01", "2025-02-28");
    expect(failed).toEqual([]);
    expect(m.salesTotal).toBe(3000);
    expect(m.salesMonthly).toEqual([{ month: "2025-01", value: 1000 }, { month: "2025-02", value: 2000 }]);
    expect(m.unitsTotal).toBe(130);
    expect(m.adSales).toBe(800);
    expect(m.adSpend).toBe(250);
    expect(m.adImpressions).toBe(20000);
    expect(m.adOrders).toBe(32);
    expect(m.sessions).toBe(2000);
    expect(m.pageViews).toBe(2510);
    expect(m.skuCount).toBe(3); // sku with sales > 0
    expect(m.buyBoxPct).toBeCloseTo((1800 * 95 + 200 * 85 + 1000 * 90) / 3000, 5);
    expect(m.topByRevenue).toEqual([{ asin: "B1", title: "Alpha", value: 2000 }, { asin: "B2", title: "Beta", value: 1000 }]);
    expect(m.topByUnits![0]).toEqual({ asin: "B1", title: "Alpha", value: 80 });
    expect(m.paidSp).toEqual({ spend: 210, sales: 700, orders: 28,
      monthly: [{ month: "2025-01", spend: 60, sales: 200 }, { month: "2025-02", spend: 150, sales: 500 }] });
    expect(m.paidSbSd).toMatchObject({ spend: 40, sales: 100, orders: 4 });
  });
  it("passes account id and dates as bind params, never interpolated", async () => {
    await pullRedshiftMetrics("123", "2025-01-01", "2025-02-28");
    for (const call of q.mock.calls) {
      expect(call[0]).not.toContain("123");
      expect(call[1]).toEqual(["123", "2025-01-01", "2025-02-28"]);
    }
  });
  it("no rows → metrics undefined (not 0), no failure", async () => {
    q.mockResolvedValue([]);
    const { metrics: m, failed } = await pullRedshiftMetrics("1", "2025-01-01", "2025-02-28");
    expect(failed).toEqual([]);
    expect(m.salesTotal).toBeUndefined();
    expect(m.topByRevenue).toBeUndefined();
    expect(m.paidSp).toBeUndefined();
  });
  it("a throwing group is recorded; other groups still land", async () => {
    q.mockImplementation((sql: string) =>
      sql.includes("product_summary") ? Promise.reject(new Error("timeout")) : Promise.resolve(sql.includes("account_summary") ? account : []));
    const { metrics: m, failed } = await pullRedshiftMetrics("1", "2025-01-01", "2025-02-28");
    expect(failed).toEqual(["products"]);
    expect(m.salesTotal).toBe(3000);
    expect(m.buyBoxPct).toBeUndefined();
  });
});

describe("helpers", () => {
  it.each([["SP M KT", "sp"], ["SP A", "sp"], ["SB M V PT", "sbsd"], ["SD PT", "sbsd"], ["SB M KT,SB M PT", "sbsd"], [null, "other"], ["", "other"]] as const)(
    "channelOf(%s) = %s", (ct, ch) => expect(channelOf(ct)).toBe(ch));
  it("normaliseBuyBox", () => { expect(normaliseBuyBox(0.95)).toBe(95); expect(normaliseBuyBox(95)).toBe(95); });
});
