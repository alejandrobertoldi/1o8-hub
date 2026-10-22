import { describe, it, expect } from "vitest";
import { usd, usdExact, mult, pct, count, splitMetric, fillTokens, monthLetter, monthShort } from "./display";

describe("display", () => {
  it("usd bands on High-Level, rounds on Detailed", () => {
    expect(usd(2_345_678, "high_level")).toBe("Low 7-Fig");
    expect(usd(2_345_678, "detailed")).toBe("$2.3M");
    expect(usd(64_600, "detailed")).toBe("$64.6K");
    expect(usd(950, "detailed")).toBe("$950");
    expect(usd(undefined, "detailed")).toBe("—");
  });
  it("usdExact", () => expect(usdExact(1234567.4)).toBe("$1,234,567"));
  it("mult/pct/count", () => {
    expect(mult(5.23)).toBe("5.2×");
    expect(mult(null)).toBe("—");
    expect(pct(98.94)).toBe("98.9%");
    expect(pct(12.345, 0)).toBe("12%");
    expect(count(1_234_567)).toBe("1.2M");
    expect(count(845_210)).toBe("845.2K");
    expect(count(9_999)).toBe("9,999");
  });
  it("splitMetric", () => {
    expect(splitMetric("$64.6K")).toEqual({ num: "$64.6", unit: "K" });
    expect(splitMetric("Mid 7-Fig")).toEqual({ num: "Mid 7", unit: "-Fig" });
    expect(splitMetric("5.2×")).toEqual({ num: "5.2", unit: "×" });
    expect(splitMetric("98.9%")).toEqual({ num: "98.9", unit: "%" });
    expect(splitMetric("9,999")).toEqual({ num: "9,999", unit: "" });
    expect(splitMetric("—")).toEqual({ num: "—", unit: "" });
  });
  it("fillTokens leaves unknown tokens", () => {
    expect(fillTokens("Hit {total} in {period}. {x}", { total: "$1", period: "2025" })).toBe("Hit $1 in 2025. {x}");
  });
  it("fillTokens with dropUnknown blanks unknown tokens", () => {
    expect(fillTokens("Hit {total} in {period}.{x}", { period: "2025" }, true)).toBe("Hit  in 2025.");
  });
  it("month labels", () => {
    expect(monthLetter("2026-01")).toBe("J");
    expect(monthShort("2026-09")).toBe("Sep");
  });
});
