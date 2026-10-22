import { describe, it, expect } from "vitest";
import {
  fmtCurrencyCompact, fmtPct, fmtRoas, fmtInt,
  cvrFromCounts, ratioPct, yoyChipMeta, bandChipMeta, buildKpiCards,
  type OverviewResponse,
} from "./kpi-derivations";

describe("formatters", () => {
  it("fmtCurrencyCompact: M/K/plain + null guard", () => {
    expect(fmtCurrencyCompact(1_500_000)).toBe("$1.50M");
    expect(fmtCurrencyCompact(33_060)).toBe("$33.06K");
    expect(fmtCurrencyCompact(950)).toBe("$950.00");
    expect(fmtCurrencyCompact(null)).toBe("$0.00");
  });
  it("fmtPct: 2dp + em-dash for null/NaN", () => {
    expect(fmtPct(36.22)).toBe("36.22%");
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(Number.NaN)).toBe("—");
  });
  it("fmtRoas: 2dp + em-dash for null", () => {
    expect(fmtRoas(4.028)).toBe("4.03");
    expect(fmtRoas(null)).toBe("—");
  });
  it("fmtInt: rounded, grouped, null→0", () => {
    expect(fmtInt(1234.6)).toBe("1,235");
    expect(fmtInt(null)).toBe("0");
  });
});

describe("cvrFromCounts (documented default: conversions / clicks × 100)", () => {
  it("normal", () => { expect(cvrFromCounts(57, 100)).toBeCloseTo(57); });
  it("zero clicks → null (distinguishes '—' from a real 0%)", () => { expect(cvrFromCounts(5, 0)).toBeNull(); });
  it("null clicks → null", () => { expect(cvrFromCounts(5, null)).toBeNull(); });
  it("zero conversions with clicks → 0", () => { expect(cvrFromCounts(0, 10)).toBe(0); });
});

describe("ratioPct", () => {
  it("normal", () => { expect(ratioPct(20, 100)).toBe(20); });
  it("zero/null whole → null", () => { expect(ratioPct(5, 0)).toBeNull(); expect(ratioPct(5, null)).toBeNull(); });
});

describe("yoyChipMeta", () => {
  it("higherBetter: up→positive, down→negative", () => {
    expect(yoyChipMeta(26.9, "higherBetter")).toEqual({ tone: "positive", text: "▲ 26.90%" });
    expect(yoyChipMeta(-26.9, "higherBetter")).toEqual({ tone: "negative", text: "▼ 26.90%" });
  });
  it("lowerBetter: up→negative, down→positive", () => {
    expect(yoyChipMeta(10, "lowerBetter").tone).toBe("negative");
    expect(yoyChipMeta(-10, "lowerBetter").tone).toBe("positive");
  });
  it("neutral direction keeps neutral tone but shows the arrow", () => {
    expect(yoyChipMeta(5, "neutral")).toEqual({ tone: "neutral", text: "▲ 5.00%" });
  });
  it("zero / null → neutral, no arrow", () => {
    expect(yoyChipMeta(0, "higherBetter")).toEqual({ tone: "neutral", text: "0.00%" });
    expect(yoyChipMeta(null, "higherBetter")).toEqual({ tone: "neutral", text: "0.00%" });
  });
});

describe("bandChipMeta", () => {
  it("maps bands to tone + label", () => {
    expect(bandChipMeta("good")).toEqual({ tone: "positive", text: "Healthy" });
    expect(bandChipMeta("warn")).toEqual({ tone: "warning", text: "Watch" });
    expect(bandChipMeta("bad")).toEqual({ tone: "negative", text: "At risk" });
    expect(bandChipMeta("none")).toEqual({ tone: "neutral", text: "—" });
  });
});

const FIXTURE: OverviewResponse = {
  totalSales: 33_060, totalSalesPY: 45_200, yoyPct: -26.9, salesGoal: 50_000,
  organicSales: 25_000, organicSalesPY: 30_000, organicSalesYoYPct: -16.7,
  adRevenue: 8_060, adRevenuePY: 15_200, adRevenueYoYPct: -47.0,
  adSpend: 2_920, adSpendPY: 2_510, adSpendYoYPct: 16.4, adSpendGoal: 4_000,
  acos: 36.22, acosPY: 16.5, acosGoal: 0.25,
  roas: 2.76, roasPY: 6.05, roasGoal: 4.0,
  conversions: 120, conversionsPY: 171, clicks: 755, clicksPY: 718, cvrYoYPct: -33.2,
  daily: [
    { report_date: "d1", product_sales: 1000, ad_revenue: 300, ad_spend: 100, ad_clicks: 20, ad_conversions: 3 },
    { report_date: "d2", product_sales: 1200, ad_revenue: 0, ad_spend: 50, ad_clicks: 0, ad_conversions: 0 },
  ],
  dailyPY: [
    { report_date: "d1", product_sales: 1400, ad_revenue: 500, ad_spend: 90, ad_clicks: 25, ad_conversions: 5 },
    { report_date: "d2", product_sales: 1600, ad_revenue: 600, ad_spend: 80, ad_clicks: 22, ad_conversions: 4 },
  ],
};

describe("buildKpiCards", () => {
  const cards = buildKpiCards(FIXTURE);
  const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));

  it("returns 7 specs: 3 hero then 4 supporting", () => {
    expect(cards.map((c) => c.variant)).toEqual(["hero", "hero", "hero", "supporting", "supporting", "supporting", "supporting"]);
    expect(cards.map((c) => c.key)).toEqual(["total-sales", "organic-sales", "ad-revenue", "ad-spend", "acos", "roas", "cvr"]);
  });
  it("total sales: value, negative YoY chip, PY + goal mini-stats", () => {
    expect(byKey["total-sales"].value).toBe("$33.06K");
    expect(byKey["total-sales"].chip).toEqual({ tone: "negative", text: "▼ 26.90%" });
    expect(byKey["total-sales"].miniStats).toEqual([
      { label: "Previous year", value: "$45.20K" },
      { label: "Period goal", value: "$50.00K" },
    ]);
  });
  it("organic sales: share-of-sales mini-stat = organic/total", () => {
    expect(byKey["organic-sales"].miniStats[1]).toEqual({ label: "Share of sales", value: "75.62%" });
  });
  it("ad spend: neutral-tone YoY chip + budget-used mini-stat", () => {
    expect(byKey["ad-spend"].chip?.tone).toBe("neutral");
    expect(byKey["ad-spend"].miniStats[1]).toEqual({ label: "Budget used", value: "73.00%" });
  });
  it("acos: band chip (36.22% → warn) + target = goal×100", () => {
    expect(byKey["acos"].chip).toEqual({ tone: "warning", text: "Watch" });
    expect(byKey["acos"].miniStats[1]).toEqual({ label: "Target", value: "25.00%" });
  });
  it("roas: band chip (2.76 → warn) + target mini-stat", () => {
    expect(byKey["roas"].chip).toEqual({ tone: "warning", text: "Watch" });
    expect(byKey["roas"].miniStats).toEqual([
      { label: "Previous year", value: "6.05" },
      { label: "Target", value: "4.00" },
    ]);
  });
  it("cvr: value = conversions/clicks, conversions-count mini-stat", () => {
    expect(byKey["cvr"].value).toBe("15.89%"); // 120/755*100
    expect(byKey["cvr"].miniStats[1]).toEqual({ label: "Conversions", value: "120" });
  });
  it("cvr sparkline guards zero-click days to 0 (no NaN/Infinity)", () => {
    expect(byKey["cvr"].spark.current).toEqual([15, 0]); // d1: 3/20*100=15, d2 guarded
  });
  it("acos chip is '—' when acos collapses to 0 (zero ad revenue)", () => {
    const zero = buildKpiCards({ ...FIXTURE, acos: 0 });
    expect(zero.find((c) => c.key === "acos")!.chip).toEqual({ tone: "neutral", text: "—" });
  });
});
