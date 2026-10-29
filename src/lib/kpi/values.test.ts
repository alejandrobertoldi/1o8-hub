import { describe, expect, it } from "vitest";
import { parseGa4Report } from "./ga4";
import { formatKpi, kpiValue, parseTarget, targetStatus } from "./values";

describe("kpiValue", () => {
  it("prefers Shopify and falls back to GA4, saying so", () => {
    expect(kpiValue("net_sales", { "shopify:net_sales": 1000, "ga4:purchase_revenue": 900 })).toEqual({ value: 1000, unit: "money", basis: "Shopify" });
    expect(kpiValue("net_sales", { "ga4:purchase_revenue": 900 })?.basis).toMatch(/GA4/);
    expect(kpiValue("conversion_rate", { "ga4:purchases": 20, "ga4:sessions": 1000 })).toMatchObject({ value: 0.02, unit: "percent" });
  });

  it("is null without its sources, or when dividing by zero", () => {
    expect(kpiValue("blended_roas", { "shopify:net_sales": 1000 })).toBeNull();
    expect(kpiValue("conversion_rate", { "ga4:purchases": 3, "ga4:sessions": 0 })).toBeNull();
    expect(kpiValue("custom", {})).toBeNull();
  });
});

describe("parseTarget / targetStatus", () => {
  it("reads money, multiples and percents", () => {
    expect(parseTarget("$150k / mo", "money")).toBe(150_000);
    expect(parseTarget("4.0x", "ratio")).toBe(4);
    expect(parseTarget("2.5%", "percent")).toBe(0.025);
    expect(parseTarget("none", "count")).toBeNull();
  });

  it("projects totals to the month and compares rates as-is", () => {
    // $60k in 10 of 30 days → $180k pace vs $150k target
    expect(targetStatus("net_sales", { value: 60_000, unit: "money", basis: "" }, 150_000, 10, 30)).toBe("on_track");
    expect(targetStatus("conversion_rate", { value: 0.018, unit: "percent", basis: "" }, 0.025, 10, 30)).toBe("behind");
    expect(targetStatus("cac", { value: 40, unit: "money", basis: "" }, 50, 10, 30)).toBe("on_track");
    expect(targetStatus("net_sales", { value: 1, unit: "money", basis: "" }, null, 10, 30)).toBeNull();
  });
});

describe("formatKpi", () => {
  it("formats by unit", () => {
    expect(formatKpi({ value: 152_340, unit: "money", basis: "" })).toBe("$152.3k");
    expect(formatKpi({ value: 0.0234, unit: "percent", basis: "" })).toBe("2.34%");
    expect(formatKpi({ value: 3.456, unit: "ratio", basis: "" })).toBe("3.46x");
  });
});

describe("parseGa4Report", () => {
  it("maps the date dimension and metric names", () => {
    const rows = parseGa4Report({
      metricHeaders: [{ name: "sessions" }, { name: "purchaseRevenue" }],
      rows: [{ dimensionValues: [{ value: "20261027" }], metricValues: [{ value: "120" }, { value: "540.5" }] }],
    });
    expect(rows).toEqual([
      { day: "2026-10-27", metric: "sessions", value: 120 },
      { day: "2026-10-27", metric: "purchase_revenue", value: 540.5 },
    ]);
  });
});
