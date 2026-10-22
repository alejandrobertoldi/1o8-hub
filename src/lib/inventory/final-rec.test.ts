import { describe, it, expect } from "vitest";
import { basisFor, liveCalcFor, isDrifted, finalRec } from "./final-rec";

describe("basisFor", () => {
  it("picks per method", () => {
    expect(basisFor("recent", 300, 900)).toBe(300);
    expect(basisFor("seasonal", 300, 900)).toBe(900);
    expect(basisFor("average", 300, 900)).toBe(600);
    expect(basisFor("greater", 300, 900)).toBe(900);
    expect(basisFor("greater", 1200, 900)).toBe(1200);
  });
  it("average ignores a zero side (matches today's avgBasis)", () => {
    expect(basisFor("average", 0, 900)).toBe(900);
    expect(basisFor("average", 300, 0)).toBe(300);
    expect(basisFor("average", 0, 0)).toBe(0);
  });
});

describe("liveCalcFor", () => {
  it("has no floating-point off-by-one on a 10% buffer", () => {
    expect(liveCalcFor(100, 0, 0, 10)).toBe(110); // Math.ceil(100*1.1) would be 111
    expect(liveCalcFor(1000, 0, 0, 10)).toBe(1100);
  });
  it("rounds fractional bases up", () => {
    expect(liveCalcFor(50.5, 0, 0, 10)).toBe(56); // 55.55 -> 56
  });
  it("subtracts stock and keeps negatives (overstock)", () => {
    expect(liveCalcFor(100, 30, 0, 10)).toBe(80);
    expect(liveCalcFor(100, 124, 0, 10)).toBe(-14);
  });
  it("applies uplift to the shortfall only, never to a negative", () => {
    expect(liveCalcFor(100, 30, 30, 10)).toBe(104); // 80 * 1.3
    expect(liveCalcFor(100, 124, 30, 10)).toBe(-14);
  });
});

describe("isDrifted", () => {
  it("is strictly greater than 25%", () => {
    expect(isDrifted(125, 100)).toBe(false);
    expect(isDrifted(126, 100)).toBe(true);
    expect(isDrifted(75, 100)).toBe(false);
    expect(isDrifted(74, 100)).toBe(true);
  });
  it("floors the denominator at 1 when liveCalc is 0", () => {
    expect(isDrifted(0, 0)).toBe(false);
    expect(isDrifted(1, 0)).toBe(true); // |1-0|/1 = 1 > .25
  });
  it("handles negative live calcs", () => {
    expect(isDrifted(-14, -14)).toBe(false);
    expect(isDrifted(0, -14)).toBe(true);
  });
});

describe("finalRec", () => {
  const s = { method: "recent" as const, upliftPct: 0 };
  it("uses liveCalc without an override", () => {
    expect(finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 30, bufferPct: 10 }, null)).toEqual({
      basis: 100, floorUnits: 0, liveCalc: 80, final: 80, overridden: false, isOverstock: false, drifted: false,
    });
  });
  it("override wins and is flagged when drifted", () => {
    const r = finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 30, bufferPct: 10 }, { qty: 200 });
    expect(r.final).toBe(200);
    expect(r.overridden).toBe(true);
    expect(r.drifted).toBe(true);
  });
  it("negative final is overstock, incl. an override of a negative", () => {
    expect(finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 124, bufferPct: 10 }, null).isOverstock).toBe(true);
    expect(finalRec(s, { recentUnits: 100, seasonalUnits: 0, stock: 0 }, { qty: -5 }).isOverstock).toBe(true);
  });
  it("zero-sales SKU with stock is overstock by its stock", () => {
    expect(finalRec(s, { recentUnits: 0, seasonalUnits: 0, stock: 40 }, null).final).toBe(-40);
  });
});

describe("buffer %", () => {
  it("defaults to 0% and accepts a per-product value", () => {
    expect(liveCalcFor(100, 40, 0)).toBe(60);
    expect(liveCalcFor(100, 40, 0, 10)).toBe(70);
    expect(liveCalcFor(100, 40, 0, 25)).toBe(85);
    expect(liveCalcFor(100, 40, 0, 0)).toBe(60);
    expect(finalRec({ method: "recent", upliftPct: 0 }, { recentUnits: 1604, seasonalUnits: 0, stock: 558, bufferPct: 10 }, null).liveCalc).toBe(1207);
  });
});

describe("minimum stock floor", () => {
  it("tops a slow seller up to the floor", () => {
    // basis 30 → target max(30, 100) = 100; stock 40 ⇒ send 60
    expect(liveCalcFor(30, 40, 0, 0, 100)).toBe(60);
    const r = finalRec({ method: "recent", upliftPct: 0 }, { recentUnits: 30, seasonalUnits: 0, stock: 40, minStock: 100 }, null);
    expect(r.liveCalc).toBe(60);
    expect(r.floorUnits).toBe(70); // 100 − 30
  });
  it("does nothing when basis + buffer already clears it, or stock is above it", () => {
    expect(finalRec({ method: "recent", upliftPct: 0 }, { recentUnits: 500, seasonalUnits: 0, stock: 40, minStock: 100 }, null).floorUnits).toBe(0);
    expect(liveCalcFor(30, 150, 0, 0, 100)).toBe(-50); // still overstock, the floor never forces a send
  });
});

