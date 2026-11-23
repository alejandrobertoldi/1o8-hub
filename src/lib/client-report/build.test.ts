import { describe, expect, it } from "vitest";
import { buildClientReport, change, completeTotals, type MonthData } from "./build";
import { lastCompletedPeriod, periodLabel, periodRange, shiftPeriod, trailingPeriods } from "./period";

describe("period helpers", () => {
  it("shifts across years", () => {
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-10", -12)).toBe("2025-10");
    expect(shiftPeriod("2025-12", 1)).toBe("2026-01");
  });
  it("knows month ranges and labels", () => {
    expect(periodRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(periodLabel("2026-10")).toBe("October 2026");
    expect(lastCompletedPeriod("2026-11-23")).toBe("2026-10");
    expect(trailingPeriods("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

const full = (totals: Record<string, number>, days = 31): MonthData => ({
  totals,
  coverage: Object.fromEntries([...new Set(Object.keys(totals).map((k) => k.split(":")[0]))].map((s) => [s, days])),
});

describe("completeTotals", () => {
  it("drops sources that cover only part of the month", () => {
    const m: MonthData = { totals: { "shopify:net_sales": 100, "meta:spend": 5 }, coverage: { shopify: 30, meta: 2 } };
    expect(completeTotals(m, "2026-09")).toEqual({ "shopify:net_sales": 100 });
    expect(completeTotals({ totals: { "meta:spend": 5 }, coverage: { meta: 2 } }, "2026-09")).toBeNull();
  });
});

describe("buildClientReport", () => {
  const base = {
    client: { code: "KSS", name: "K9 Sport Sack", logo: null, raw: { AccountManager_MF: "Ana Pérez", ExecutiveStrategist_MF: "Aalap" } },
    period: "2026-10",
    days: { "2026-10-01": { "shopify:net_sales": 40 }, "2026-10-02": {} },
    dataThrough: "2026-10-31",
    generatedAt: "2026-11-23T00:00:00Z",
  };

  it("compares with the previous month and the same month last year", () => {
    const r = buildClientReport({
      ...base,
      months: {
        "2026-10": full({ "shopify:net_sales": 1200, "shopify:orders": 12, "ga4:sessions": 600 }),
        "2026-09": full({ "shopify:net_sales": 1000, "shopify:orders": 10, "ga4:sessions": 500 }, 30),
        "2025-10": full({ "shopify:net_sales": 800, "shopify:orders": 8 }),
      },
    });
    const net = r.kpis.find((k) => k.key === "net_sales")!;
    expect(net).toMatchObject({ value: 1200, previous: 1000, lastYear: 800 });
    // No Main KPIs picked: defaults with data only.
    expect(r.kpis.map((k) => k.key)).toEqual(["net_sales", "orders", "aov", "conversion_rate", "sessions"]);
    expect(r.preparedBy).toBe("Ana Pérez");
    expect(r.period).toMatchObject({ label: "October 2026", previousLabel: "September 2026", lastYearLabel: "October 2025" });
  });

  it("only includes sections with data and starts trends at the first month with data", () => {
    const r = buildClientReport({
      ...base,
      months: {
        "2026-10": full({ "shopify:net_sales": 1200, "shopify:orders": 12 }),
        "2026-09": full({ "shopify:net_sales": 1000, "shopify:orders": 10 }, 30),
      },
    });
    expect(r.sections.map((s) => s.key)).toEqual(["sales"]);
    const sales = r.sections[0];
    expect(sales.trend!.points.map((p) => p.period)).toEqual(["2026-09", "2026-10"]);
    expect(sales.daily!.points).toEqual([
      { day: "2026-10-01", value: 40 },
      { day: "2026-10-02", value: null },
    ]);
    expect(sales.groups[0].rows.find((x) => x.key === "net_sales")?.lastYear).toBeNull();
  });

  it("uses the client's Main KPIs with monthly targets", () => {
    const r = buildClientReport({
      ...base,
      client: { ...base.client, raw: { MainKPIs: JSON.stringify([{ key: "net_sales", target: "$1k / mo" }, { key: "cac", target: "$50" }]) } },
      months: { "2026-10": full({ "shopify:net_sales": 1200, "shopify:new_customers": 4, "meta:spend": 300 }) },
    });
    expect(r.kpis.map((k) => [k.key, k.onTrack])).toEqual([
      ["net_sales", true],
      ["cac", false],
    ]);
  });
});

describe("change", () => {
  it("is null without a base", () => {
    expect(change(5, null)).toBeNull();
    expect(change(5, 0)).toBeNull();
    expect(change(150, 100)).toBeCloseTo(0.5);
  });
});
