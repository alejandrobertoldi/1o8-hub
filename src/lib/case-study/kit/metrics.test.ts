import { describe, it, expect } from "vitest";
import { effective, deriveMetrics, emptyMetrics, isMissing, PRIVATE_USD_KEYS } from "./metrics";

const months = (vals: number[]) => vals.map((value, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, value }));

describe("effective", () => {
  it("override beats auto; auto survives where no override", () => {
    const m = emptyMetrics("2025-01-01", "2025-12-31");
    m.auto = { salesTotal: 100, sessions: 50 };
    m.overrides = { salesTotal: 120 };
    expect(effective(m)).toMatchObject({ salesTotal: 120, sessions: 50 });
  });
  it("missing stays undefined, never 0", () => {
    expect(effective(emptyMetrics("2025-01-01", "2025-12-31")).salesTotal).toBeUndefined();
  });
});

describe("deriveMetrics", () => {
  it("computes ratios", () => {
    const d = deriveMetrics({ salesTotal: 1000, adSales: 250, adSpend: 100, unitsTotal: 50, sessions: 500 });
    expect(d.organicSales).toBe(750);
    expect(d.organicPct).toBe(75);
    expect(d.adPct).toBe(25);
    expect(d.roas).toBe(2.5);
    expect(d.acos).toBe(40);
    expect(d.cvrPct).toBe(10);
    expect(d.asp).toBe(20);
  });
  it("12 months: growth multiple = last3 avg / first3 avg, H1/H2 split, peak, cumulative", () => {
    const d = deriveMetrics({ salesMonthly: months([10, 10, 10, 20, 20, 20, 30, 30, 30, 40, 40, 40]) });
    expect(d.growthMultiple).toBe(4);
    expect(d.startSales).toBe(10);
    expect(d.h1AvgSales).toBe(15);
    expect(d.h2AvgSales).toBe(35);
    expect(d.h2VsH1Pct).toBeCloseTo(133.33, 1);
    expect(d.peakMonth).toBe("2025-10");
    expect(d.peakSales).toBe(40);
    expect(d.cumulative.at(-1)).toEqual({ month: "2025-12", value: 300 });
  });
  it("fewer than 6 months → growth multiple and H1/H2 are null, peak still works", () => {
    const d = deriveMetrics({ salesMonthly: months([5, 8, 3]) });
    expect(d.growthMultiple).toBeNull();
    expect(d.h1AvgSales).toBeNull();
    expect(d.h2VsH1Pct).toBeNull();
    expect(d.peakSales).toBe(8);
  });
  it("zero denominators → null, never NaN/Infinity", () => {
    const d = deriveMetrics({ salesTotal: 0, adSales: 0, adSpend: 0, unitsTotal: 0, sessions: 0,
      salesMonthly: months([0, 0, 0, 0, 0, 0]) });
    for (const v of [d.organicPct, d.adPct, d.roas, d.acos, d.cvrPct, d.asp, d.growthMultiple, d.h2VsH1Pct])
      expect(v).toBeNull();
  });
  it("top-3 share of revenue", () => {
    const d = deriveMetrics({ salesTotal: 200, topByRevenue: [
      { asin: "A", title: "a", value: 80 }, { asin: "B", title: "b", value: 40 },
      { asin: "C", title: "c", value: 30 }, { asin: "D", title: "d", value: 10 } ] });
    expect(d.top3RevenueSharePct).toBe(75);
  });
  it("channel ACOS", () => {
    const blk = (spend: number, sales: number) => ({ spend, sales, orders: 1, monthly: [] });
    const d = deriveMetrics({ paidSp: blk(30, 100), paidSbSd: blk(10, 0) });
    expect(d.spAcos).toBe(30);
    expect(d.sbSdAcos).toBeNull();
  });
});

describe("isMissing / PRIVATE_USD_KEYS", () => {
  it("derived missing when its inputs are missing", () => {
    const e = { salesTotal: 100 };
    const d = deriveMetrics(e);
    expect(isMissing(e, d, "salesTotal")).toBe(false);
    expect(isMissing(e, d, "roas")).toBe(true);
    expect(isMissing(e, d, "sessions")).toBe(true);
  });
  it("empty arrays count as missing", () => {
    const e = { topByRevenue: [] };
    expect(isMissing(e, deriveMetrics(e), "topByRevenue")).toBe(true);
  });
  it("private $ keys are exactly the absolute-dollar ones", () => {
    expect([...PRIVATE_USD_KEYS].sort()).toEqual(
      ["adSales", "adSpend", "asp", "h1AvgSales", "h2AvgSales", "organicSales", "peakSales", "salesTotal", "startSales"].sort());
  });
});
