import { describe, it, expect } from "vitest";
import { fmtMoney, fmtMoneyShort, fmtPct, fmtInt, fmtDelta, fmtPtsDelta } from "./format";

describe("fmtMoney", () => {
  it("formats with currency symbol and 2 decimals", () => {
    expect(fmtMoney(1234.5)).toBe("$1,234.50");
  });
  it("dashes null", () => {
    expect(fmtMoney(null)).toBe("—");
  });
});

describe("fmtMoneyShort", () => {
  it("uses K for thousands", () => {
    expect(fmtMoneyShort(14872)).toBe("$14.87K");
  });
  it("uses M for millions", () => {
    expect(fmtMoneyShort(2500000)).toBe("$2.50M");
  });
  it("plain for < 1000", () => {
    expect(fmtMoneyShort(42)).toBe("$42.00");
  });
});

describe("fmtPct", () => {
  it("defaults to 2 decimals", () => {
    expect(fmtPct(8.1234)).toBe("8.12%");
  });
  it("honours decimals arg", () => {
    expect(fmtPct(95.01, 1)).toBe("95.0%");
  });
});

describe("fmtInt", () => {
  it("thousand-separates", () => {
    expect(fmtInt(12345)).toBe("12,345");
  });
});

describe("fmtDelta", () => {
  it("positive with arrow, no plus sign", () => {
    expect(fmtDelta(0.152)).toBe("▲ 15.2%");
  });
  it("negative with arrow, no minus sign", () => {
    expect(fmtDelta(-0.083)).toBe("▼ 8.3%");
  });
  it("flat for tiny deltas", () => {
    expect(fmtDelta(0.0005)).toBe("— 0.0%");
  });
  it("dashes null", () => {
    expect(fmtDelta(null)).toBe("—");
  });
});

describe("fmtPtsDelta", () => {
  it("unsigned point delta as 0.00%", () => {
    expect(fmtPtsDelta(-0.2)).toBe("0.20%");
    expect(fmtPtsDelta(1.65)).toBe("1.65%");
    expect(fmtPtsDelta(0.4, 1)).toBe("0.4%");
  });
});
