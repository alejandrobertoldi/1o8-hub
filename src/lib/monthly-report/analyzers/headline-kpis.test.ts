import { describe, it, expect } from "vitest";
import { buildHeadlineResult } from "./headline-kpis";
import type { AccountSummaryRow } from "../queries/account";

const base: AccountSummaryRow = {
  product_sales: 100000,
  product_quantity: 5000,
  total_order_items: 4200,
  ad_revenue: 30000,
  ad_spend: 7500,
  browser_sessions: 0,
  mobile_sessions: 0,
  ad_impressions: 0,
};

describe("buildHeadlineResult", () => {
  it("returns null when current row is null", () => {
    expect(buildHeadlineResult(null, null)).toBeNull();
  });

  it("computes current KPIs without previous", () => {
    const r = buildHeadlineResult(base, null);
    expect(r).not.toBeNull();
    expect(r!.current.sales).toBe(100000);
    expect(r!.current.units).toBe(5000);
    expect(r!.current.orderItems).toBe(4200);
    expect(r!.current.aov).toBeCloseTo(100000 / 4200, 4);
    expect(r!.previous).toBeNull();
    expect(r!.deltas.sales).toBeNull();
  });

  it("computes MoM deltas when previous exists", () => {
    const prev: AccountSummaryRow = { ...base, product_sales: 80000, product_quantity: 4000, total_order_items: 3500 };
    const r = buildHeadlineResult(base, prev);
    expect(r!.deltas.sales).toBe(20000);
    expect(r!.deltas.units).toBe(1000);
    expect(r!.deltas.aov).toBeCloseTo((100000 / 4200) - (80000 / 3500), 4);
  });

  it("stores CVR as a point delta, not a relative percent", () => {
    const curr: AccountSummaryRow = { ...base, browser_sessions: 50000, total_order_items: 1850 };
    const prev: AccountSummaryRow = { ...base, browser_sessions: 50000, total_order_items: 1950 };
    const r = buildHeadlineResult(curr, prev);
    // 1850/50000 = 3.7%, 1950/50000 = 3.9% → −0.2 pts, not −5.1%
    expect(r!.current.cvr).toBeCloseTo(3.7, 5);
    expect(r!.previous!.cvr).toBeCloseTo(3.9, 5);
    expect(r!.deltas.cvr).toBeCloseTo(-0.2, 5);
  });

  it("treats a zero previous as a full-current delta", () => {
    const prev: AccountSummaryRow = { ...base, product_sales: 0 };
    const r = buildHeadlineResult(base, prev);
    expect(r!.deltas.sales).toBe(100000);
  });

  it("aov is null when order items is 0", () => {
    const r = buildHeadlineResult({ ...base, total_order_items: 0 }, null);
    expect(r!.current.aov).toBeNull();
  });
});
