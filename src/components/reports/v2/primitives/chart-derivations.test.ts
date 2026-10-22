import { describe, it, expect } from "vitest";
import {
  combinedSeries,
  cpcCvrSeries,
  trafficSeries,
  computeFunnel,
  rankByRoas,
  toScatter,
} from "./chart-derivations";
import type { OverviewDailyRow, OverviewResponse } from "./kpi-derivations";
import type { CampaignRow } from "./campaigns";

function row(p: Partial<OverviewDailyRow>): OverviewDailyRow {
  return {
    report_date: "2026-01-01",
    product_sales: null, ad_revenue: null, ad_spend: null,
    ad_clicks: null, ad_conversions: null, ad_impressions: null,
    ...p,
  };
}

function overview(p: Partial<OverviewResponse>): OverviewResponse {
  return {
    totalSales: 0, totalSalesPY: 0, yoyPct: 0, salesGoal: 0,
    organicSales: 0, organicSalesPY: 0, organicSalesYoYPct: 0,
    adRevenue: 0, adRevenuePY: 0, adRevenueYoYPct: 0,
    adSpend: 0, adSpendPY: 0, adSpendYoYPct: 0, adSpendGoal: 0,
    acos: 0, acosPY: 0, acosGoal: 0,
    roas: 0, roasPY: 0, roasGoal: 0,
    conversions: 0, conversionsPY: 0,
    clicks: 0, clicksPY: 0, cvrYoYPct: 0,
    daily: [], dailyPY: [],
    ...p,
  };
}

function camp(p: Partial<CampaignRow>): CampaignRow {
  return { adSpend: 0, adRevenue: 0, acos: 0, roas: 0, avgCpc: 0, impressions: 0, clicks: 0, conversions: 0, cvr: 0, ...p };
}

describe("combinedSeries", () => {
  it("maps sales/adRevenue/adSpend and computes ACoS = spend/revenue×100", () => {
    const out = combinedSeries([row({ report_date: "d1", product_sales: 100, ad_revenue: 40, ad_spend: 10 })]);
    expect(out[0]).toEqual({ date: "d1", sales: 100, adRevenue: 40, adSpend: 10, acos: 25 });
  });
  it("guards zero/absent ad_revenue → acos 0 (no NaN/Infinity)", () => {
    expect(combinedSeries([row({ ad_spend: 10, ad_revenue: 0 })])[0].acos).toBe(0);
    expect(combinedSeries([row({ ad_spend: 10, ad_revenue: null })])[0].acos).toBe(0);
  });
  it("coerces null sales/revenue/spend to 0", () => {
    expect(combinedSeries([row({})])[0]).toEqual({ date: "2026-01-01", sales: 0, adRevenue: 0, adSpend: 0, acos: 0 });
  });
  it("handles empty / undefined input", () => {
    expect(combinedSeries([])).toEqual([]);
    // @ts-expect-error exercising the null-guard
    expect(combinedSeries(undefined)).toEqual([]);
  });
});

describe("cpcCvrSeries", () => {
  it("CPC = spend/clicks, CVR = conversions/clicks×100", () => {
    const out = cpcCvrSeries([row({ report_date: "d1", ad_spend: 20, ad_clicks: 10, ad_conversions: 2 })]);
    expect(out[0]).toEqual({ date: "d1", cpc: 2, cvr: 20 });
  });
  it("guards zero clicks → cpc 0 and cvr 0", () => {
    expect(cpcCvrSeries([row({ ad_spend: 20, ad_clicks: 0, ad_conversions: 2 })])[0]).toEqual({ date: "2026-01-01", cpc: 0, cvr: 0 });
  });
});

describe("trafficSeries", () => {
  it("maps impressions/clicks and computes CTR = clicks/impressions×100", () => {
    const out = trafficSeries([row({ report_date: "d1", ad_impressions: 1000, ad_clicks: 50 })]);
    expect(out[0]).toEqual({ date: "d1", impressions: 1000, clicks: 50, ctr: 5 });
  });
  it("guards zero impressions → ctr 0", () => {
    expect(trafficSeries([row({ ad_impressions: 0, ad_clicks: 50 })])[0].ctr).toBe(0);
  });
});

describe("computeFunnel", () => {
  it("orders Sessions → Clicks → Conversions → Sales with counts", () => {
    const f = computeFunnel(overview({ sessions: 1000, clicks: 400, conversions: 40, totalSales: 2000 }));
    expect(f.map((s) => s.key)).toEqual(["sessions", "clicks", "conversions", "sales"]);
    expect(f.map((s) => s.value)).toEqual([1000, 400, 40, 2000]);
  });
  it("computes % of sessions for each count step; sessions itself = 100", () => {
    const f = computeFunnel(overview({ sessions: 1000, clicks: 400, conversions: 40, totalSales: 2000 }));
    expect(f[0].pctOfSessions).toBe(100);   // sessions
    expect(f[1].pctOfSessions).toBe(40);    // clicks
    expect(f[2].pctOfSessions).toBe(4);     // conversions
    expect(f[3].pctOfSessions).toBeNull();  // sales step is $ — no % of sessions
  });
  it("final Sales step carries $/order = totalSales / conversions", () => {
    const f = computeFunnel(overview({ sessions: 1000, clicks: 400, conversions: 40, totalSales: 2000 }));
    expect(f[3].unit).toBe("currency");
    expect(f[3].dollarsPerOrder).toBe(50);
  });
  it("guards zero conversions → $/order 0 (no Infinity)", () => {
    const f = computeFunnel(overview({ sessions: 1000, clicks: 400, conversions: 0, totalSales: 2000 }));
    expect(f[3].dollarsPerOrder).toBe(0);
  });
  it("guards zero/absent sessions → pctOfSessions null on every step (no div-by-zero)", () => {
    const f = computeFunnel(overview({ clicks: 400, conversions: 40, totalSales: 2000 })); // sessions undefined
    expect(f.map((s) => s.pctOfSessions)).toEqual([null, null, null, null]);
  });
});

describe("rankByRoas", () => {
  it("sorts by ROAS descending and bands each row", () => {
    const out = rankByRoas([
      camp({ campaignType: "A", roas: 2.5, adSpend: 10, adRevenue: 25 }),
      camp({ campaignType: "B", roas: 5.0, adSpend: 10, adRevenue: 50 }),
      camp({ campaignType: "C", roas: 1.0, adSpend: 10, adRevenue: 10 }),
    ]);
    expect(out.map((r) => r.label)).toEqual(["B", "A", "C"]);
    expect(out.map((r) => r.band)).toEqual(["good", "warn", "bad"]); // ≥4 good, 2–3.99 warn, <2 bad
  });
  it("breaks ROAS ties deterministically by label", () => {
    const out = rankByRoas([camp({ campaignType: "Zeta", roas: 3 }), camp({ campaignType: "Alpha", roas: 3 })]);
    expect(out.map((r) => r.label)).toEqual(["Alpha", "Zeta"]);
  });
  it("falls back campaignType → campaignName → 'Unknown'", () => {
    expect(rankByRoas([camp({ campaignName: "Named", roas: 1 })])[0].label).toBe("Named");
    expect(rankByRoas([camp({ roas: 1 })])[0].label).toBe("Unknown");
  });
  it("handles empty input", () => {
    expect(rankByRoas([])).toEqual([]);
  });
});

describe("toScatter", () => {
  it("maps x=adSpend, y=roas, bands, and scales r from adRevenue into [6,28]", () => {
    const out = toScatter([
      camp({ campaignType: "big", adSpend: 100, roas: 5, adRevenue: 500 }),  // max revenue → maxR
      camp({ campaignType: "zero", adSpend: 10, roas: 1, adRevenue: 0 }),    // 0 revenue → minR
      camp({ campaignType: "half", adSpend: 50, roas: 2, adRevenue: 250 }),  // half → midpoint
    ]);
    const big = out.find((p) => p.label === "big")!;
    const zero = out.find((p) => p.label === "zero")!;
    const half = out.find((p) => p.label === "half")!;
    expect(big).toMatchObject({ x: 100, y: 5, r: 28, band: "good" });
    expect(zero).toMatchObject({ x: 10, y: 1, r: 6, band: "bad" });
    expect(half.r).toBeCloseTo(17, 5); // 6 + 0.5×(28−6)
  });
  it("all-zero revenue → every bubble at minR (no div-by-zero)", () => {
    const out = toScatter([camp({ adSpend: 5, roas: 1, adRevenue: 0 }), camp({ adSpend: 8, roas: 2, adRevenue: 0 })]);
    expect(out.every((p) => p.r === 6)).toBe(true);
  });
  it("handles empty input", () => {
    expect(toScatter([])).toEqual([]);
  });
});
