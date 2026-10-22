import { describe, it, expect } from "vitest";
import { niceAxisMax, axisTicks, barRects, BARS, linePoints, pathD, areaD, peakIndex, labelIndexes, CUMULATIVE } from "./chart-geometry";

describe("axis", () => {
  it.each([[8_700, 9_000], [9_000, 9_000], [62_000, 75_000], [1, 3], [0, 3], [1_234_567, 1_500_000]])(
    "niceAxisMax(%d) = %d", (max, expected) => expect(niceAxisMax(max)).toBe(expected));
  it("ticks", () => expect(axisTicks(9000)).toEqual([9000, 6000, 3000, 0]));
});

describe("bars", () => {
  it("maps like the template (value/axisMax × 240, baseline 280, pitch 65.85)", () => {
    const r = barRects([4500, 9000], 9000);
    expect(r[0]).toEqual({ x: 74, y: 160, width: 44, height: 120 });
    expect(r[1].x).toBeCloseTo(139.85, 2);
    expect(r[1].y).toBe(BARS.top);
  });
  it("zero values → zero height at baseline", () => {
    expect(barRects([0], 9000)[0]).toMatchObject({ y: 280, height: 0 });
  });
});

describe("lines", () => {
  it("spreads n points across x0→x1 and maps y", () => {
    const p = linePoints([0, 50, 100], 100, CUMULATIVE);
    expect(p).toEqual([{ x: 60, y: 250 }, { x: 460, y: 145 }, { x: 860, y: 40 }]);
  });
  it("single point sits at x0", () => {
    expect(linePoints([10], 10, CUMULATIVE)).toEqual([{ x: 60, y: 40 }]);
  });
  it("empty → empty path strings", () => {
    expect(pathD([])).toBe("");
    expect(areaD([], 250)).toBe("");
  });
  it("path formats 1 dp", () => {
    expect(pathD([{ x: 60, y: 245.94 }, { x: 132.73, y: 237.2 }])).toBe("M60 245.9 L132.7 237.2");
    expect(areaD([{ x: 60, y: 200 }, { x: 860, y: 50 }], 250)).toBe("M60 200 L860 50 L860 250 L60 250 Z");
  });
  it("peak + labels", () => {
    expect(peakIndex([1, 9, 3])).toBe(1);
    expect(peakIndex([])).toBe(-1);
    expect(labelIndexes(12, 5)).toEqual([0, 3, 6, 8, 11]);
    expect(labelIndexes(3, 5)).toEqual([0, 1, 2]);
  });
});
