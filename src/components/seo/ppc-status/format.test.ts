import { describe, it, expect } from "vitest";
import { fmtDelta, fmtMoney, fmtAvg, blockWindowLabel } from "./format";

describe("fmtDelta", () => {
  it("percent change with sign", () => {
    expect(fmtDelta(10, 15)).toBe("+50%");
    expect(fmtDelta(10, 5)).toBe("−50%");
  });
  it("from zero → 'new'", () => {
    expect(fmtDelta(0, 3)).toBe("new");
  });
  it("missing side → em dash", () => {
    expect(fmtDelta(null, 3)).toBe("—");
    expect(fmtDelta(0, 0)).toBe("—");
  });
});

describe("fmtMoney", () => {
  it("USD 2dp", () => {
    expect(fmtMoney(1234.5)).toBe("$1,234.50");
  });
});

describe("fmtAvg", () => {
  it("zero → '0'", () => {
    expect(fmtAvg(0)).toBe("0");
  });
  it("less than 1 → 2 decimals", () => {
    expect(fmtAvg(0.03)).toBe("0.03");
  });
  it("0.5 → 2 decimals", () => {
    expect(fmtAvg(0.5)).toBe("0.50");
  });
  it("1–10 → 1 decimal", () => {
    expect(fmtAvg(1.44)).toBe("1.4");
  });
  it("10+ → whole numbers", () => {
    expect(fmtAvg(12.6)).toBe("13");
    expect(fmtAvg(1234.2)).toBe("1,234");
  });
});

describe("blockWindowLabel", () => {
  it("live with a full after window", () => {
    expect(blockWindowLabel({ before: { start: "2026-05-03", end: "2026-06-01", days: 30 }, after: { start: "2026-06-02", end: "2026-07-01", days: 30 } }, 30, "2026-06-02", "live"))
      .toBe("Before 2026-05-03 → 06-01 · After 06-02 → 07-01 (30 days)");
  });
  it("live today", () => {
    expect(blockWindowLabel({ before: { start: "2026-08-30", end: "2026-09-28", days: 30 }, after: { start: "2026-09-29", end: "2026-09-28", days: 0 } }, 30, "2026-09-29", "live"))
      .toBe("Live today — no after-window yet");
  });
  it("future", () => {
    expect(blockWindowLabel({ before: null, after: null }, 30, "2099-01-01", "future")).toBe("Goes live on 2099-01-01");
  });
});
