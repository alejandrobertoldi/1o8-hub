import { describe, it, expect } from "vitest";
import { accentFor, BAND_HEX, CHART_DATA } from "./chart-colors";

describe("accentFor — the load-bearing dual-accent rule", () => {
  it("hub emphasis series is burnt orange", () => {
    expect(accentFor("hub")).toBe("#F7BF1D");
  });
  it("portal emphasis series is charcoal — NEVER orange", () => {
    expect(accentFor("portal")).toBe("#2C2B35");
    expect(accentFor("portal").toLowerCase()).not.toContain("ff751f");
  });
});

describe("BAND_HEX — health band → status hex", () => {
  it("maps each band", () => {
    expect(BAND_HEX.good).toBe("#18864B");
    expect(BAND_HEX.warn).toBe("#A66600");
    expect(BAND_HEX.bad).toBe("#C73737");
    expect(BAND_HEX.none).toBe("#94A3B8");
  });
});

describe("CHART_DATA — shared categorical colors (identical both surfaces)", () => {
  it("exposes the §4.4 data hexes", () => {
    expect(CHART_DATA.adRevenue).toBe("#18864B");
    expect(CHART_DATA.adSpend).toBe("#65418A");
    expect(CHART_DATA.cvrCtr).toBe("#5B6EF5");
    expect(CHART_DATA.impressions).toBe("#94A3B8");
  });
});
