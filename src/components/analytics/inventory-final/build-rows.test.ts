import { describe, it, expect } from "vitest";
import { buildRows, filterRows, toSnapshotRows, orphanedOverrides, countUnsendableRows, pickPrimarySku } from "./build-rows";
import { DEFAULT_REC_SETTINGS } from "@/lib/inventory/rec-settings";

const prod = (sku: string, over: Partial<{ units_90d: number; q1_quantity: number; available: number }> = {}) => ({
  asin: `B-${sku}`, sku, product_name: sku, main_image_url: "",
  units_90d: over.units_90d ?? 100, q1_quantity: over.q1_quantity ?? 0,
  current: { available: over.available ?? 0, inbound_quantity: 0, reserved_quantity: 0 },
  health: null,
});
const stockOf = (p: ReturnType<typeof prod>) => p.current.available;
const ov = (sku: string, qty: number) => ({ asin: `B-${sku}`, sku, qty, note: "n", setBy: "x", setAt: "2026-10-01T00:00:00.000Z" });

describe("buildRows", () => {
  it("falls back to units_90d / q1_quantity without windows", () => {
    const [r] = buildRows([prod("A", { units_90d: 100, q1_quantity: 300 })], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    expect(r.recentUnits).toBe(100);
    expect(r.seasonalUnits).toBe(300);
    expect(r.rec.final).toBe(300); // default method "greater": max(100, 300), default buffer 0%
    expect(r.allMethods).toEqual({ recent: 100, seasonal: 300, average: 200 });
  });
  it("uses windows when present (missing SKU ⇒ 0 units)", () => {
    const w = { recent: { start: "a", end: "b" }, seasonal: { start: "c", end: "d" }, units: { "B-A|A": { recent: 50, seasonal: 0 } } };
    const rows = buildRows([prod("A"), prod("B")], DEFAULT_REC_SETTINGS, w, new Map(), stockOf);
    expect(rows[0].recentUnits).toBe(50);
    expect(rows[1].recentUnits).toBe(0);
  });
  it("needsAction = positive final or overstock (drift no longer counts)", () => {
    const rows = buildRows(
      [prod("SEND"), prod("OK", { available: 100 }), prod("OVER", { available: 200 }), prod("DRIFT", { available: 100 })],
      DEFAULT_REC_SETTINGS, undefined, new Map([["DRIFT", ov("DRIFT", 50)]]), stockOf,
    );
    expect(rows.map((r) => [r.p.sku, r.needsAction])).toEqual([["SEND", true], ["OK", false], ["OVER", true], ["DRIFT", true]]);
    expect(filterRows(rows, "overstock").map((r) => r.p.sku)).toEqual(["OVER"]);
    expect(filterRows(rows, "needs-action")).toHaveLength(3);
  });
});

describe("snapshot helpers", () => {
  it("toSnapshotRows rounds fractional basis and carries override + note", () => {
    const s = { ...DEFAULT_REC_SETTINGS, method: "average" as const };
    const rows = buildRows([prod("A", { units_90d: 100, q1_quantity: 1 })], s, undefined, new Map([["A", ov("A", 7)]]), stockOf);
    expect(toSnapshotRows(rows)[0]).toMatchObject({ sku: "A", basisUnits: 51, overrideQty: 7, note: "n", final: 7 });
  });
  it("orphanedOverrides finds overrides with no row", () => {
    const rows = buildRows([prod("A")], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    expect(orphanedOverrides(rows, new Map([["A", ov("A", 1)], ["GONE", ov("GONE", 2)]])).map((o) => o.sku)).toEqual(["GONE"]);
  });
});

describe("rows without an ASIN or SKU", () => {
  const rows = () => buildRows(
    [prod("A"), { ...prod("NOASIN"), asin: "" }, { ...prod("X"), sku: "   " }, { ...prod("Y"), asin: " \t" }],
    DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf,
  );
  it("toSnapshotRows excludes them", () => {
    expect(toSnapshotRows(rows()).map((r) => r.sku)).toEqual(["A"]);
  });
  it("countUnsendableRows counts them", () => {
    expect(countUnsendableRows(rows())).toBe(3);
    expect(countUnsendableRows(buildRows([prod("A")], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf))).toBe(0);
  });
});

describe("ASIN pooling (same ASIN, several SKUs)", () => {
  const sku = (sku: string, inbound: number, available: number, units_90d = 0) =>
    ({ ...prod(sku, { units_90d, available }), asin: "B0V", current: { available, inbound_quantity: inbound, reserved_quantity: 0 } });
  const win = (units: Record<string, { recent: number; seasonal: number }>, byAsin?: Record<string, { recent: number; seasonal: number }>) =>
    ({ recent: { start: "a", end: "b" }, seasonal: { start: "c", end: "d" }, units, byAsin });

  it("sends to the SKU with inbound, even when its twin sells more (004 vs VAR12PCK-1)", () => {
    const list = [sku("004", 0, 700), sku("VAR12PCK-1", 420, 492)];
    const w = win({ "B0V|004": { recent: 626, seasonal: 1 }, "B0V|VAR12PCK-1": { recent: 516, seasonal: 0 } }, { B0V: { recent: 1142, seasonal: 2522 } });
    expect(pickPrimarySku(list, (p) => w.units[`B0V|${p.sku}`].recent)).toBe("VAR12PCK-1");
    const [dup, main] = buildRows(list, DEFAULT_REC_SETTINGS, w, new Map(), stockOf);
    expect(main.group).toEqual({ role: "primary", primarySku: "VAR12PCK-1", skus: ["004", "VAR12PCK-1"], pooledStock: 1192 });
    // ASIN totals against pooled stock (this test's stockOf = available), 0% buffer: 2522 − (700 + 492).
    expect(main.rec.final).toBe(1330);
    expect(dup.group.role).toBe("selldown");
    expect(dup.rec.final).toBe(0);
    expect(dup.needsAction).toBe(false);
    expect(dup.recentUnits).toBe(626); // its own units, for reference
  });

  it("falls back to the best recent seller when no SKU has inbound", () => {
    const list = [sku("A", 0, 5, 10), sku("B", 0, 5, 90)];
    const rows = buildRows(list, DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    expect(rows.map((r) => r.group.role)).toEqual(["selldown", "primary"]);
    expect(rows[1].recentUnits).toBe(100); // units_90d summed without windows
  });

  it("leaves single-SKU ASINs alone", () => {
    const [r] = buildRows([prod("SOLO", { units_90d: 100 })], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    expect(r.group.role).toBe("single");
    expect(r.group.pooledStock).toBe(r.stock);
  });

  it("sends a sell-down SKU as final 0", () => {
    const list = [sku("004", 0, 700), sku("VAR12PCK-1", 420, 492)];
    const snap = toSnapshotRows(buildRows(list, DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf));
    expect(snap.find((r) => r.sku === "004")?.final).toBe(0);
  });
});

describe("toSnapshotRows stock lines", () => {
  it("stores AWD and the hub's buckets, pooled on the send-here SKU", () => {
    const mk = (sku: string, inbound: number, available: number, awd: number) => ({
      ...prod(sku), asin: "B0P", awd_onhand: awd, awd_inbound: 5,
      current: { available, inbound_quantity: inbound, reserved_quantity: 9, reserved_customerorders: 3, reserved_fc_transfers: 2, reserved_fc_processing: 1 },
    });
    const rows = buildRows([mk("DUP", 0, 10, 100), mk("MAIN", 40, 20, 50)], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    const snap = toSnapshotRows(rows);
    const main = snap.find((r) => r.sku === "MAIN")!;
    // on-hand = available + FC transfer; reserved = customer orders + FC processing; summed over both SKUs
    expect(main).toMatchObject({ available: (10 + 2) + (20 + 2), inbound: 40, reserved: (3 + 1) * 2, awdAvailable: 150, awdInbound: 10 });
    const dup = snap.find((r) => r.sku === "DUP")!;
    expect(dup).toMatchObject({ available: 12, inbound: 0, reserved: 4, awdAvailable: 100, awdInbound: 5, final: 0 });
  });
});

describe("minimum stock (active listings only)", () => {
  it("applies to Active rows and not to inactive ones", () => {
    const slow = (sku: string, status: string) => ({ ...prod(sku, { units_90d: 10, available: 20 }), listing_status: status });
    const [active, inactive] = buildRows([slow("A", "Active"), slow("I", "Inactive")], DEFAULT_REC_SETTINGS, undefined, new Map(), stockOf);
    expect(active.rec.final).toBe(80); // max(10, 100) − 20
    expect(inactive.rec.final).toBe(-10); // 10 − 20, never topped up
  });
});

