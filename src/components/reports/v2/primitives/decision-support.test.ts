import { describe, it, expect } from "vitest";
import type { MetricRow } from "./table-derivations";
import {
  rankPerformers, rankRisks, recommendedActions,
  DEFAULT_THRESHOLDS, TOP_N,
} from "./decision-support";

const mr = (o: Partial<MetricRow>): MetricRow => ({
  name: "r", adSpend: 0, adRevenue: 0, acos: 0, roas: 0, avgCpc: 0,
  impressions: 0, clicks: 0, conversions: 0, cvr: 0,
  orders: 0, units: 0, ntbOrders: 0, ntbPct: 0, ...o,
});

describe("rankPerformers", () => {
  it("includes roas exactly at the floor (>=)", () => {
    expect(rankPerformers([mr({ name: "a", roas: 4.0 })]).map((r) => r.name)).toEqual(["a"]);
  });
  it("excludes roas just below the floor", () => {
    expect(rankPerformers([mr({ name: "a", roas: 3.99 })])).toEqual([]);
  });
  it("sorts by roas descending (full list, not truncated)", () => {
    const out = rankPerformers([
      mr({ name: "lo", roas: 4.5 }), mr({ name: "hi", roas: 25 }), mr({ name: "mid", roas: 8 }),
    ]);
    expect(out.map((r) => r.name)).toEqual(["hi", "mid", "lo"]);
  });
  it("returns [] for empty input", () => {
    expect(rankPerformers([])).toEqual([]);
  });
});

describe("rankRisks", () => {
  it("high-ACoS boundary: exactly 60 is excluded, above 60 included", () => {
    expect(rankRisks([mr({ name: "at60", acos: 60, conversions: 3 })])).toEqual([]);
    const out = rankRisks([mr({ name: "over", acos: 60.01, conversions: 3, adSpend: 5 })]);
    expect(out.map((r) => r.name)).toEqual(["over"]);
    expect(out[0].reasons).toEqual({ highAcos: true, zeroConv: false });
  });
  it("zero-conv boundary: spend exactly 15 excluded, above 15 with 0 conv included", () => {
    expect(rankRisks([mr({ name: "at15", adSpend: 15, conversions: 0 })])).toEqual([]);
    const out = rankRisks([mr({ name: "over", adSpend: 15.01, conversions: 0 })]);
    expect(out.map((r) => r.name)).toEqual(["over"]);
    expect(out[0].reasons).toEqual({ highAcos: false, zeroConv: true });
  });
  it("zero-conv requires conversions === 0 (spend>15 with a conversion does not trip zero-conv)", () => {
    expect(rankRisks([mr({ name: "x", adSpend: 100, conversions: 1, acos: 30 })])).toEqual([]);
  });
  it("a row tripping both reasons carries both flags", () => {
    const out = rankRisks([mr({ name: "both", acos: 80, adSpend: 20, conversions: 0 })]);
    expect(out[0].reasons).toEqual({ highAcos: true, zeroConv: true });
  });
  it("sorts by adSpend descending", () => {
    const out = rankRisks([
      mr({ name: "lo", acos: 70, adSpend: 5, conversions: 2 }),
      mr({ name: "hi", acos: 70, adSpend: 90, conversions: 2 }),
    ]);
    expect(out.map((r) => r.name)).toEqual(["hi", "lo"]);
  });
  it("returns [] for empty input", () => {
    expect(rankRisks([])).toEqual([]);
  });
});

describe("TOP_N truncation on ranked output", () => {
  it("slice(0, TOP_N) yields the two highest performers", () => {
    const out = rankPerformers([
      mr({ name: "a", roas: 5 }), mr({ name: "b", roas: 9 }), mr({ name: "c", roas: 7 }),
    ]).slice(0, TOP_N);
    expect(out.map((r) => r.name)).toEqual(["b", "c"]);
  });
});

describe("recommendedActions", () => {
  it("returns [] when nothing triggers", () => {
    expect(recommendedActions([mr({ roas: 1, acos: 10, adSpend: 1, conversions: 1 })], [])).toEqual([]);
  });
  it("emits cut-zero-conv with the full count (not top-2)", () => {
    const kw = [
      mr({ name: "z1", adSpend: 20, conversions: 0 }),
      mr({ name: "z2", adSpend: 30, conversions: 0 }),
      mr({ name: "z3", adSpend: 40, conversions: 0 }),
    ];
    const actions = recommendedActions(kw, []);
    const a = actions.find((x) => x.kind === "cut-zero-conv");
    expect(a?.count).toBe(3);
    expect(a?.text).toContain("3 zero-conversion terms");
  });
  it("emits cut-high-acos for high-ACoS terms", () => {
    const a = recommendedActions([mr({ name: "h", acos: 90, conversions: 4 })], []);
    expect(a.find((x) => x.kind === "cut-high-acos")?.count).toBe(1);
  });
  it("emits scale-keywords for keyword performers", () => {
    const a = recommendedActions([mr({ name: "p", roas: 8 })], []);
    expect(a.find((x) => x.kind === "scale-keywords")?.count).toBe(1);
  });
  it("shift-budget comes only from campaign performers; absent campaigns suppress it", () => {
    const withCamp = recommendedActions([], [mr({ name: "c", roas: 6 }), mr({ name: "c2", roas: 5 })]);
    expect(withCamp.find((x) => x.kind === "shift-budget")?.count).toBe(2);
    const noCamp = recommendedActions([mr({ name: "p", roas: 8 })], []);
    expect(noCamp.find((x) => x.kind === "shift-budget")).toBeUndefined();
  });
  it("emits all four kinds in fixed waste-first order, capped at 4", () => {
    const kw = [
      mr({ name: "zc", adSpend: 20, conversions: 0 }),
      mr({ name: "ha", acos: 90, conversions: 3 }),
      mr({ name: "perf", roas: 10 }),
    ];
    const camp = [mr({ name: "cperf", roas: 6 })];
    const kinds = recommendedActions(kw, camp).map((a) => a.kind);
    expect(kinds).toEqual(["cut-zero-conv", "cut-high-acos", "scale-keywords", "shift-budget"]);
  });
  it("respects custom thresholds", () => {
    const kw = [mr({ name: "p", roas: 3.0 })];
    expect(recommendedActions(kw, [], { ...DEFAULT_THRESHOLDS, roasScaleFloor: 3.0 })
      .find((x) => x.kind === "scale-keywords")?.count).toBe(1);
  });
});
