import { describe, it, expect } from "vitest";
import { analyzeB2b } from "./b2b";

describe("analyzeB2b", () => {
  it("returns null when row is null", () => {
    expect(analyzeB2b(null)).toBeNull();
  });

  it("returns null when no sales and no units", () => {
    expect(analyzeB2b({ total_sales: 0, b2b_sales: 0, total_units: 0, b2b_units: 0 })).toBeNull();
  });

  it("computes share percentages", () => {
    const r = analyzeB2b({ total_sales: 1000, b2b_sales: 150, total_units: 100, b2b_units: 8 });
    expect(r!.b2bShareSales).toBeCloseTo(15, 4);
    expect(r!.b2bShareUnits).toBeCloseTo(8, 4);
    expect(r!.totalSales).toBe(1000);
  });

  it("handles zero totals without dividing by zero", () => {
    const r = analyzeB2b({ total_sales: 0, b2b_sales: 0, total_units: 50, b2b_units: 10 });
    expect(r!.b2bShareSales).toBe(0);
    expect(r!.b2bShareUnits).toBe(20);
  });
});
