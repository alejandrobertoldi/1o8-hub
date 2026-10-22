import { describe, it, expect } from "vitest";
import { bandFigure } from "./banding";

describe("bandFigure", () => {
  it.each([
    [450_000, "Mid 6-Fig"],
    [2_100_000, "Low 7-Fig"],
    [780_000, "High 6-Fig"],
    [3_000_000, "Low 7-Fig"],
    [3_999_999, "Low 7-Fig"],
    [4_000_000, "Mid 7-Fig"],
    [2_999_999, "Low 7-Fig"],
    [6_999_999, "Mid 7-Fig"],
    [7_000_000, "High 7-Fig"],
    [999_999.9, "High 6-Fig"],
    [1_000, "Low 4-Fig"],
    [3_500, "Low 4-Fig"],
    [4_000, "Mid 4-Fig"],
    [35_000, "Low 5-Fig"],
    [39_999, "Low 5-Fig"],
    [40_000, "Mid 5-Fig"],
    [64_600, "Mid 5-Fig"],
    [70_000, "High 5-Fig"],
    [12_000_000, "Low 8-Fig"],
    [150_000_000, "Low 9-Fig"],
  ])("%d → %s", (usd, expected) => {
    expect(bandFigure(usd)).toBe(expected);
  });

  it("small values are <4-Fig", () => {
    expect(bandFigure(999)).toBe("<4-Fig");
    expect(bandFigure(1)).toBe("<4-Fig");
  });

  it("zero, negative, null, undefined, NaN, Infinity → n/a", () => {
    for (const v of [0, -5, null, undefined, NaN, Infinity]) expect(bandFigure(v as number)).toBe("n/a");
  });

  it("never contains a digit-bearing dollar sign", () => {
    for (const v of [1_234, 56_789, 987_654, 4_321_000]) expect(bandFigure(v)).not.toMatch(/\$\d/);
  });
});
