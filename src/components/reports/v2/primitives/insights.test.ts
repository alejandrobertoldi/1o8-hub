import { describe, it, expect } from "vitest";
import { computeInsights, DEFAULT_INSIGHT_THRESHOLDS, type Insight } from "./insights";
import type { OverviewResponse } from "./kpi-derivations";

// A fully-loaded fixture: sales/organic/ad-rev all down YoY, spend up while ad-rev
// down, ACoS/TACoS/ROAS all off target, CVR down. Values mirror the Phase-2 fixture.
const LOADED: OverviewResponse = {
  totalSales: 33_060, totalSalesPY: 45_200, yoyPct: -26.9, salesGoal: 50_000,
  organicSales: 25_000, organicSalesPY: 30_000, organicSalesYoYPct: -16.7,
  adRevenue: 8_060, adRevenuePY: 15_200, adRevenueYoYPct: -47.0,
  adSpend: 2_920, adSpendPY: 2_510, adSpendYoYPct: 16.4, adSpendGoal: 4_000,
  acos: 36.22, acosPY: 16.5, acosGoal: 0.25,
  roas: 2.76, roasPY: 6.05, roasGoal: 4.0,
  tacos: 8.83, tacosGoal: 0.05,
  conversions: 120, conversionsPY: 171, conversionsYoYPct: -29.8,
  clicks: 755, clicksPY: 718, clicksYoYPct: 5.2, cvrYoYPct: -33.2,
  daily: [], dailyPY: [],
};

// A base fixture where NOTHING fires (all rules quiet). Per-rule tests spread this
// and switch on ONE metric, so the top-4 slice can never hide the insight under test.
const QUIET: OverviewResponse = {
  totalSales: 100, totalSalesPY: 100, yoyPct: 0, salesGoal: 0,
  organicSales: 50, organicSalesPY: 50, organicSalesYoYPct: 0,
  adRevenue: 50, adRevenuePY: 50, adRevenueYoYPct: 0,
  adSpend: 10, adSpendPY: 10, adSpendYoYPct: 0, adSpendGoal: 0,
  acos: 20, acosPY: 20, acosGoal: 0,
  roas: 5, roasPY: 5, roasGoal: 0,
  tacos: 3, tacosGoal: 0,
  conversions: 10, conversionsPY: 10, conversionsYoYPct: 0,
  clicks: 100, clicksPY: 100, clicksYoYPct: 0, cvrYoYPct: 0,
  daily: [], dailyPY: [],
};

const byKind = (r: Insight[], k: Insight["kind"]) => r.filter((i) => i.kind === k);

describe("computeInsights — YoY rule", () => {
  it("emits only the single largest sales-family mover (ad revenue −47%)", () => {
    const yoy = byKind(computeInsights(LOADED), "yoy");
    expect(yoy).toHaveLength(1);
    expect(yoy[0].sourceMetrics).toEqual(["adRevenue"]);
    expect(yoy[0].severity).toBeCloseTo(47.0);
    expect(yoy[0].tone).toBe("negative");
    expect(yoy[0].title).toContain("down");
    expect(yoy[0].detail).toContain("$8.06K");
    expect(yoy[0].detail).toContain("$15.20K");
  });

  it("a positive largest mover is toned positive and titled 'up'", () => {
    const up = computeInsights({ ...LOADED,
      yoyPct: 4, organicSalesYoYPct: 3, adRevenueYoYPct: 40, // ad revenue biggest, positive
    });
    const yoy = byKind(up, "yoy")[0];
    expect(yoy.tone).toBe("positive");
    expect(yoy.title).toContain("up");
  });

  it("does not emit when the largest move is below the material threshold", () => {
    const flat = computeInsights({ ...LOADED,
      yoyPct: 2, organicSalesYoYPct: 1, adRevenueYoYPct: -3,
      // neutralize the other rules so only the YoY rule is under test
      adSpendYoYPct: -1, acos: 10, roas: 5, tacos: 1, cvrYoYPct: -2, conversionsYoYPct: -1,
    });
    expect(byKind(flat, "yoy")).toHaveLength(0);
  });

  it("empty-PY: all PY = 0 → no YoY insight (keys off PY, not the 0% the route emits)", () => {
    const noPy = computeInsights({ ...LOADED,
      totalSalesPY: 0, organicSalesPY: 0, adRevenuePY: 0,
      yoyPct: 0, organicSalesYoYPct: 0, adRevenueYoYPct: 0,
    });
    expect(byKind(noPy, "yoy")).toHaveLength(0);
  });
});

describe("computeInsights — efficiency rule", () => {
  it("emits when spend is up and ad revenue is down; severity = spend% + |rev%|", () => {
    const eff = byKind(computeInsights(LOADED), "efficiency");
    expect(eff).toHaveLength(1);
    expect(eff[0].severity).toBeCloseTo(16.4 + 47.0);
    expect(eff[0].tone).toBe("negative");
    expect(eff[0].sourceMetrics).toEqual(["adSpend", "adRevenue"]);
  });

  it("does NOT emit when ad revenue is also up", () => {
    const eff = byKind(computeInsights({ ...LOADED, adRevenueYoYPct: 5 }), "efficiency");
    expect(eff).toHaveLength(0);
  });

  it("does NOT emit without PY context (adRevenuePY = 0)", () => {
    const eff = byKind(computeInsights({ ...LOADED, adRevenuePY: 0 }), "efficiency");
    expect(eff).toHaveLength(0);
  });
});

describe("computeInsights — target-variance rule", () => {
  // Rule-level tests isolate the metric under test (QUIET base) so top-4 truncation
  // can never hide it — in LOADED, ROAS/traffic are genuinely (and correctly) sliced out.
  it("ACoS above target → negative, severity = distance/target × 100", () => {
    const acos = byKind(computeInsights({ ...QUIET, acos: 36.22, acosGoal: 0.25 }), "target-variance")[0];
    expect(acos).toBeDefined();
    expect(acos.sourceMetrics).toEqual(["acos"]);
    expect(acos.severity).toBeCloseTo(((36.22 - 25) / 25) * 100); // ≈ 44.88
    expect(acos.detail).toContain("36.22%");
    expect(acos.detail).toContain("25.00%");
    expect(acos.tone).toBe("negative");
  });

  it("ROAS below target emits; TACoS above target emits", () => {
    const roas = byKind(computeInsights({ ...QUIET, roas: 2.76, roasGoal: 4.0 }), "target-variance")[0];
    const tacos = byKind(computeInsights({ ...QUIET, tacos: 8.83, tacosGoal: 0.05 }), "target-variance")[0];
    expect(roas.sourceMetrics).toEqual(["roas"]);
    expect(roas.severity).toBeCloseTo(((4.0 - 2.76) / 4.0) * 100); // 31
    expect(tacos.sourceMetrics).toEqual(["tacos"]);
    expect(tacos.severity).toBeCloseTo(((8.83 - 5) / 5) * 100);    // ≈ 76.6
  });

  it("no fabricated targets: never emits target-variance for cvr/conversions/clicks/adRevenue", () => {
    const tv = byKind(computeInsights(LOADED), "target-variance");
    const goalless = new Set(["cvr", "conversions", "clicks", "adRevenue"]);
    for (const i of tv) expect(goalless.has(i.sourceMetrics[0])).toBe(false);
  });

  it("goal of 0/absent → no target-variance insight (no fabrication)", () => {
    const noGoals = computeInsights({ ...LOADED,
      salesGoal: 0, adSpendGoal: 0, acosGoal: 0, tacosGoal: 0, roasGoal: 0,
    });
    expect(byKind(noGoals, "target-variance")).toHaveLength(0);
  });

  it("value 0 for acos/roas/tacos (route no-data collapse) → skipped", () => {
    const zero = computeInsights({ ...LOADED, acos: 0, roas: 0, tacos: 0 });
    const tv = byKind(zero, "target-variance").map((i) => i.sourceMetrics[0]);
    expect(tv).not.toContain("acos");
    expect(tv).not.toContain("roas");
    expect(tv).not.toContain("tacos");
  });

  it("adSpend UNDER budget is not a breach (higher-is-worse only flags overage)", () => {
    // LOADED adSpend 2920 < goal 4000 → under budget → no insight
    const tv = byKind(computeInsights(LOADED), "target-variance");
    expect(tv.find((i) => i.sourceMetrics[0] === "adSpend")).toBeUndefined();
  });
});

describe("computeInsights — traffic-anomaly rule", () => {
  it("emits on CVR YoY drop; severity = max(|cvr|,|conv|); detail carries current CVR", () => {
    // Isolated (QUIET base): in LOADED the traffic anomaly is correctly sliced out of top-4.
    const ta = byKind(computeInsights({ ...QUIET, cvrYoYPct: -33.2, clicksYoYPct: 5.2, conversionsYoYPct: -29.8 }), "traffic-anomaly");
    expect(ta).toHaveLength(1);
    expect(ta[0].severity).toBeCloseTo(33.2);
    expect(ta[0].tone).toBe("negative");
    expect(ta[0].detail).toContain("CVR");
  });

  it("does not emit when the drop is below threshold", () => {
    const ta = byKind(computeInsights({ ...LOADED, cvrYoYPct: -3, conversionsYoYPct: -2 }), "traffic-anomaly");
    expect(ta).toHaveLength(0);
  });

  it("does not emit without PY (clicksPY = 0 and conversionsPY = 0)", () => {
    const ta = byKind(computeInsights({ ...LOADED, clicksPY: 0, conversionsPY: 0 }), "traffic-anomaly");
    expect(ta).toHaveLength(0);
  });
});

describe("computeInsights — ranking, top-4, ties, empty", () => {
  it("returns at most 4, sorted by severity desc", () => {
    const r = computeInsights(LOADED);
    expect(r.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].severity).toBeGreaterThanOrEqual(r[i].severity);
    // Highest-severity candidate in LOADED is TACoS (≈76.6)
    expect(r[0].kind).toBe("target-variance");
    expect(r[0].sourceMetrics).toEqual(["tacos"]);
  });

  it("ties break by KIND_RANK then title (deterministic)", () => {
    // Craft equal severities across kinds:
    //  - target-variance ACoS: (30-25)/25*100 = 20
    //  - target-variance ROAS: (4-3.2)/4*100 = 20
    //  - yoy ad revenue: |−20| = 20
    const tie = computeInsights({ ...LOADED,
      acos: 30, roas: 3.2, tacos: 5, tacosGoal: 0.05,       // tacos on target → no tacos insight
      salesGoal: 0, adSpendGoal: 0,                          // drop sales/adSpend variance
      yoyPct: -20, organicSalesYoYPct: -5, adRevenueYoYPct: -20,
      adSpendYoYPct: -1,                                     // kill efficiency (spend not up)
      cvrYoYPct: -2, conversionsYoYPct: -1,                 // kill traffic anomaly
    });
    // target-variance (rank 0) before yoy (rank 2); within target-variance ACoS < ROAS by title.
    expect(tie.map((i) => `${i.kind}:${i.sourceMetrics[0]}`)).toEqual([
      "target-variance:acos",
      "target-variance:roas",
      "yoy:totalSales",
    ]);
  });

  it("fewer than 4 qualifying → returns fewer, never padded", () => {
    // Only efficiency + one yoy qualify.
    const few = computeInsights({ ...LOADED,
      salesGoal: 0, adSpendGoal: 0, acosGoal: 0, tacosGoal: 0, roasGoal: 0, // no target-variance
      cvrYoYPct: -2, conversionsYoYPct: -1,                                  // no traffic anomaly
    });
    expect(few.length).toBe(2);
    expect(few.map((i) => i.kind).sort()).toEqual(["efficiency", "yoy"]);
  });

  it("flat + on-target + no PY → empty array", () => {
    const empty = computeInsights({ ...LOADED,
      totalSalesPY: 0, organicSalesPY: 0, adRevenuePY: 0, adSpendPY: 0,
      yoyPct: 0, organicSalesYoYPct: 0, adRevenueYoYPct: 0, adSpendYoYPct: 0,
      salesGoal: 0, adSpendGoal: 0, acosGoal: 0, tacosGoal: 0, roasGoal: 0,
      clicksPY: 0, conversionsPY: 0, cvrYoYPct: 0, conversionsYoYPct: 0,
    });
    expect(empty).toEqual([]);
  });

  it("a stricter threshold config suppresses borderline insights", () => {
    const strict = computeInsights(LOADED, { ...DEFAULT_INSIGHT_THRESHOLDS, materialTargetVariancePct: 50 });
    const tv = byKind(strict, "target-variance").map((i) => i.sourceMetrics[0]);
    // Only TACoS (≈76.6) clears a 50% floor; ACoS(44.9)/ROAS(31)/sales(33.9) drop.
    expect(tv).toEqual(["tacos"]);
  });
});
