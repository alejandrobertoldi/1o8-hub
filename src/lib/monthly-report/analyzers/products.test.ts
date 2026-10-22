import { describe, it, expect } from "vitest";
import { analyzeProducts } from "./products";
import type { RawProductRow } from "../queries/products";

function mk(partial: Partial<RawProductRow>): RawProductRow {
  return {
    asin: "B001", parent_asin: null, title: null, sku: null,
    sessions: 100, units: 10, sales: 250, order_items: 9, buy_box: 95,
    ...partial,
  };
}

describe("analyzeProducts", () => {
  it("returns null when rows empty", () => {
    expect(analyzeProducts([])).toBeNull();
  });

  it("sorts by sales descending and keeps the full catalog", () => {
    const rows = Array.from({ length: 30 }, (_, i) => mk({ asin: `B${i}`, sales: i }));
    const result = analyzeProducts(rows);
    expect(result).not.toBeNull();
    expect(result!.nTotal).toBe(30);
    expect(result!.rows).toHaveLength(30);
    expect(result!.rows[0].asin).toBe("B29");
  });

  it("computes CVR as units/sessions*100", () => {
    const r = analyzeProducts([mk({ sessions: 200, units: 10 })]);
    expect(r!.rows[0].cvr).toBe(5);
  });

  it("null CVR when sessions = 0", () => {
    const r = analyzeProducts([mk({ sessions: 0, units: 5 })]);
    expect(r!.rows[0].cvr).toBeNull();
  });

  it("null AOV when order_items = 0", () => {
    const r = analyzeProducts([mk({ sales: 100, order_items: 0 })]);
    expect(r!.rows[0].aov).toBeNull();
  });

  it("preserves null buy_box (unadvertised ASIN case)", () => {
    const r = analyzeProducts([mk({ buy_box: null })]);
    expect(r!.rows[0].buyBox).toBeNull();
  });
});
