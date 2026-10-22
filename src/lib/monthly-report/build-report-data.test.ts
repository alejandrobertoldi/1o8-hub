import { describe, it, expect } from "vitest";
import { buildReportData } from "./build-report-data";
import type { HeadlineResult, ProductsResult, MonthlyPeriod, ClientContext } from "./types";

const client: ClientContext = { name: "Dr. Cuddles", accountId: "1899670", slug: "dr-cuddles", clientIdCode: "DRC_SC_US" };
const period: MonthlyPeriod = {
  period: "2026-03",
  start: "2026-03-01",
  end: "2026-03-31",
  prevStart: "2026-02-01",
  prevEnd: "2026-02-28",
  label: "March 2026",
};
const headline: HeadlineResult = {
  current: { sales: 124000, units: 2800, sessions: 0, pageviews: 0, orderItems: 3000, cvr: 8.1, buyBox: 94, aov: 44 },
  previous: { sales: 100000, units: 2400, sessions: 0, pageviews: 0, orderItems: 2600, cvr: 7.2, buyBox: 92, aov: 42 },
  deltas: { sales: 24000, units: 400, sessions: null, cvr: 0.9, buyBox: 2, aov: 2 },
};
const products: ProductsResult = {
  rows: [
    { asin: "A1", parent: "P1", title: "Kit", sku: "SKU-A", sessions: 100, units: 50, sales: 2000, orderItems: 55, cvr: 8, buyBox: 95, aov: 40 },
  ],
  nTotal: 1,
};
const revenueSeries = [
  { month: "OCT", revenue: 80000 },
  { month: "NOV", revenue: 85000 },
  { month: "DEC", revenue: 95000 },
  { month: "JAN", revenue: 90000 },
  { month: "FEB", revenue: 100000 },
  { month: "MAR", revenue: 124000 },
];

describe("buildReportData", () => {
  it("sets no client logo when Drive has none for the client", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "x", logoCodes: new Set(["OTHER_SC_US"]) });
    expect(r.meta.clientLogoUrl).toBeNull();
  });

  it("builds a complete Report when all inputs present", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro", logoCodes: new Set(["DRC_SC_US"]) });
    expect(r.meta.client).toBe("Dr. Cuddles");
    expect(r.meta.month).toBe("March 2026");
    expect(r.meta.lead).toBe("Manu Lancharro");
    expect(r.meta.reportId).toBe("March|26|DRC_SC_US");
    expect(r.meta.clientIdCode).toBe("DRC_SC_US");
    expect(r.meta.clientLogoUrl).toBe("/client-logos/DRC_SC_US.png");
    expect(r.sections).toEqual(["cover", "toc", "kpis", "mom", "products"]);
    expect(r.kpis?.length).toBeGreaterThanOrEqual(4);
    expect(r.kpis?.find(k => k.label === "Units ordered")?.prev).toBe("2,400");
    expect(r.kpis?.find(k => k.label === "Units ordered")?.delta).toBe("400");
    expect(r.kpis?.find(k => k.label === "Product sales")?.prev).toBe("$100K");
    expect(r.kpis?.find(k => k.label === "Product sales")?.delta).toBe("$24K");
    expect(r.kpis?.find(k => k.label === "CVR")?.delta).toBe("0.90%");
    expect(r.kpis?.find(k => k.label === "Buy-box")?.delta).toBe("2.00%");
    expect(r.mom?.table.find(row => row.metric === "CVR")?.delta).toBe("0.90%");
    expect(r.mom?.table.find(row => row.metric === "AOV")?.delta).toBe("$2");
    expect(r.mom?.revenueSeries.length).toBe(6);
    expect(r.mom?.table.length).toBeGreaterThan(0);
    expect(r.products?.length).toBe(1);
    expect(r.sections).not.toContain("appendix");
    expect(r.appendix).toBeUndefined();
  });

  it("formats a CVR drop as unsigned points, not a relative percent", () => {
    const drop: HeadlineResult = {
      ...headline,
      current: { ...headline.current, cvr: 3.7 },
      previous: { ...headline.previous!, cvr: 3.9 },
      deltas: { ...headline.deltas, cvr: -0.2 },
    };
    const r = buildReportData({ client, period, headline: drop, products, revenueSeries, lead: "Manu Lancharro" });
    const cvr = r.kpis?.find((k) => k.label === "CVR");
    expect(cvr?.value).toBe("3.7%");
    expect(cvr?.prev).toBe("3.9%");
    expect(cvr?.delta).toBe("0.20%");
    expect(cvr?.direction).toBe("down");
    expect(r.mom?.table.find((row) => row.metric === "CVR")?.delta).toBe("0.20%");
  });

  it("omits 'products' section when products is null", () => {
    const r = buildReportData({ client, period, headline, products: null, revenueSeries, lead: "Manu Lancharro" });
    expect(r.sections).not.toContain("products");
    expect(r.products).toBeUndefined();
  });

  it("renders null-delta rows when previous month missing", () => {
    const noPrev: HeadlineResult = { ...headline, previous: null, deltas: { sales: null, units: null, sessions: null, cvr: null, buyBox: null, aov: null } };
    const r = buildReportData({ client, period, headline: noPrev, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.mom?.table.every(row => row.delta === "—")).toBe(true);
  });

  it("uses 1o8 burnt orange as the default accent", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.meta.accent).toBe("#F7BF1D");
  });

  it("passes through highlights/goals/risks when provided and pushes ids in correct order", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      highlights: [{ title: "h", body: "b", meta: "m" }],
      goals:      [{ title: "g", body: "b", owner: "o", success: "s" }],
      risks:      [{ item: "r", owner: "o", severity: "high", impact: "x", status: "s" }],
    });
    expect(r.sections).toEqual([
      "cover", "toc", "kpis", "mom", "highlights", "products", "goals", "risks",
    ]);
    expect(r.highlights?.length).toBe(1);
    expect(r.goals?.length).toBe(1);
    expect(r.risks?.length).toBe(1);
  });

  it("builds compareSales aligned by day-of-month over the full current month", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      dailyCurrent: [
        { day: 1, sales: 1000, units: 10, orderItems: 8 },
        { day: 5, sales: 2000, units: 20, orderItems: 18 },
      ],
      dailyPrevYear: [
        { day: 1, sales: 800, units: 8, orderItems: 6 },
        { day: 31, sales: 500, units: 5, orderItems: 4 },
      ],
    });
    expect(r.compareSales).toBeDefined();
    expect(r.compareSales!.currentLabel).toBe("Mar 2026");
    expect(r.compareSales!.previousLabel).toBe("Mar 2025");
    // March has 31 days
    expect(r.compareSales!.sales).toHaveLength(31);
    expect(r.compareSales!.salesPrev).toHaveLength(31);
    expect(r.compareSales!.units).toHaveLength(31);
    expect(r.compareSales!.unitsPrev).toHaveLength(31);
    // Day 1 is populated for both
    expect(r.compareSales!.sales[0]).toEqual({ label: "1", value: 1000 });
    expect(r.compareSales!.salesPrev[0]).toEqual({ label: "1", value: 800 });
    // Day 2 is gap-filled to zero for both
    expect(r.compareSales!.sales[1]).toEqual({ label: "2", value: 0 });
    expect(r.compareSales!.salesPrev[1]).toEqual({ label: "2", value: 0 });
    // Day 5 has current data, prev is zero
    expect(r.compareSales!.sales[4]).toEqual({ label: "5", value: 2000 });
    expect(r.compareSales!.salesPrev[4]).toEqual({ label: "5", value: 0 });
    // Day 31 has prev data, current is zero
    expect(r.compareSales!.sales[30]).toEqual({ label: "31", value: 0 });
    expect(r.compareSales!.salesPrev[30]).toEqual({ label: "31", value: 500 });
    // Units track sales independently
    expect(r.compareSales!.units[0]).toEqual({ label: "1", value: 10 });
    expect(r.compareSales!.unitsPrev[30]).toEqual({ label: "31", value: 5 });
  });

  it("compareSales.table sums dailies and computes YoY % change with direction", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      dailyCurrent: [
        { day: 1, sales: 5000, units: 120, orderItems: 100 },
        { day: 2, sales: 5326.6, units: 121, orderItems: 122 },
      ],
      dailyPrevYear: [
        { day: 1, sales: 1706.82, units: 18, orderItems: 17 },
      ],
    });
    const t = r.compareSales!.table;
    expect(t.columns).toEqual([
      "Total order items",
      "Units ordered",
      "Ordered product sales",
      "Average units/order item",
      "Average sales/order item",
    ]);
    // Current totals: 222 order items, 241 units, $10,326.60 sales
    expect(t.current[0]).toBe("222");
    expect(t.current[1]).toBe("241");
    expect(t.current[2]).toBe("$10,326.60");
    // Previous totals: 17, 18, $1,706.82
    expect(t.previous[0]).toBe("17");
    expect(t.previous[1]).toBe("18");
    expect(t.previous[2]).toBe("$1,706.82");
    // Absolute deltas, unsigned — direction is color only
    expect(t.changes[0]).toEqual({ value: "205", direction: "up" });
    expect(t.changes[1]).toEqual({ value: "223", direction: "up" });
    expect(t.changes[2]).toEqual({ value: "$8,619.78", direction: "up" });
    expect(t.changes[4].direction).toBe("down");
  });

  it("omits compareSales when no daily series provided", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.compareSales).toBeUndefined();
  });

  it("builds campaigns aligned by day-of-month with totals + ACoS when campaign daily provided", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      dailyCurrent: [
        { day: 1,  sales: 1000.00, units: 10, orderItems: 8 },
        { day: 5,  sales: 500.00,  units: 5,  orderItems: 5 },
      ],
      campaignDaily: [
        { day: 1,  impressions: 10000, spend: 50.50,  revenue: 200.00 },
        { day: 5,  impressions: 8000,  spend: 32.10,  revenue: 130.40 },
        { day: 31, impressions: 5000,  spend: 18.00,  revenue: 75.20 },
      ],
    });
    expect(r.campaigns).toBeDefined();
    expect(r.sections).toContain("campaigns");
    // 'campaigns' should sit between 'kpis' and 'mom' in section order
    const idxKpis = r.sections.indexOf("kpis");
    const idxCampaigns = r.sections.indexOf("campaigns");
    const idxMom = r.sections.indexOf("mom");
    expect(idxKpis).toBeLessThan(idxCampaigns);
    expect(idxCampaigns).toBeLessThan(idxMom);

    // 31-day series, gap-filled with zeros
    expect(r.campaigns!.series.totalSales).toHaveLength(31);
    expect(r.campaigns!.series.adSpend).toHaveLength(31);
    expect(r.campaigns!.series.adRevenue).toHaveLength(31);
    expect(r.campaigns!.series.acos).toHaveLength(31);
    expect(r.campaigns!.series.totalSales[0]).toEqual({ label: "1", value: 1000.00 });
    expect(r.campaigns!.series.totalSales[1]).toEqual({ label: "2", value: 0 });
    expect(r.campaigns!.series.totalSales[4]).toEqual({ label: "5", value: 500.00 });
    expect(r.campaigns!.series.adRevenue[30]).toEqual({ label: "31", value: 75.20 });
    // ACoS day 1 = 50.50 / 200.00 * 100 = 25.25%
    expect(r.campaigns!.series.acos[0].value).toBeCloseTo(25.25, 4);
    // ACoS day 2 (no ad data) = 0
    expect(r.campaigns!.series.acos[1].value).toBe(0);

    // Stats: Total Sales, Ad Spend, Ad Revenue, ACoS
    expect(r.campaigns!.stats.map(s => s.label)).toEqual(["Total Sales", "Ad Spend", "Ad Revenue", "ACoS"]);
    expect(r.campaigns!.stats[0].value).toBe("$1,500.00");      // 1000 + 500
    expect(r.campaigns!.stats[1].value).toBe("$100.60");        // 50.50 + 32.10 + 18.00
    expect(r.campaigns!.stats[2].value).toBe("$405.60");        // 200 + 130.40 + 75.20
    // Period ACoS = 100.60 / 405.60 * 100 = 24.80% (24.7929...)
    expect(r.campaigns!.stats[3].value).toBe("24.80%");
    expect(r.campaigns!.dateRange).toBe("Mar 1 - Mar 31, 2026");
  });

  it("attaches previous-month values and MoM on campaign stats", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      dailyCurrent: [{ day: 1, sales: 1500, units: 10, orderItems: 8 }],
      campaignDaily: [{ day: 1, impressions: 1000, spend: 100.60, revenue: 405.60 }],
      campaignDailyPrev: [{ day: 1, impressions: 800, spend: 50.30, revenue: 202.80 }],
    });
    expect(r.campaigns!.stats[0].prev).toBe("$100,000.00");
    expect(r.campaigns!.stats[1].prev).toBe("$50.30");
    expect(r.campaigns!.stats[1].delta).toBe("$50.30");
    expect(r.campaigns!.stats[2].prev).toBe("$202.80");
    expect(r.campaigns!.stats[3].prev).toBe("24.80%");
    expect(r.campaigns!.stats[3].delta).toBe("0.00%");
    expect(r.campaigns!.stats[3].direction).toBe("flat");
  });

  it("formats ACoS as a point delta, not a relative percent", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      dailyCurrent: [{ day: 1, sales: 1500, units: 10, orderItems: 8 }],
      campaignDaily: [{ day: 1, impressions: 1000, spend: 38.62, revenue: 100 }],
      campaignDailyPrev: [{ day: 1, impressions: 800, spend: 36.97, revenue: 100 }],
    });
    const acos = r.campaigns!.stats.find((s) => s.label === "ACoS");
    expect(acos?.value).toBe("38.62%");
    expect(acos?.prev).toBe("36.97%");
    // 38.62 − 36.97 = 1.65%, not +4.5% relative
    expect(acos?.delta).toBe("1.65%");
    expect(acos?.direction).toBe("down");
    expect(r.mom?.table.find((row) => row.metric === "ACoS")?.delta).toBe("1.65%");
  });

  it("omits campaigns when no campaign daily provided", () => {
    const r = buildReportData({ client, period, headline, products, revenueSeries, lead: "Manu Lancharro" });
    expect(r.campaigns).toBeUndefined();
    expect(r.sections).not.toContain("campaigns");
  });

  it("omits campaigns when campaign daily has only zero metrics", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      campaignDaily: [{ day: 1, impressions: 0, spend: 0, revenue: 0 }],
    });
    expect(r.campaigns).toBeUndefined();
    expect(r.sections).not.toContain("campaigns");
  });

  it("omits new sections when their arrays are empty or undefined", () => {
    const r = buildReportData({
      client, period, headline, products, revenueSeries, lead: "Manu Lancharro",
      highlights: [],
      // goals/risks omitted
    });
    expect(r.sections).not.toContain("highlights");
    expect(r.sections).not.toContain("goals");
    expect(r.sections).not.toContain("risks");
    expect(r.highlights).toEqual([]);     // pass-through preserves the empty array
    expect(r.goals).toBeUndefined();
    expect(r.risks).toBeUndefined();
  });
});
