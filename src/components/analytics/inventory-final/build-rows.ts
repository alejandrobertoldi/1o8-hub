// Pure row maths for the inventory table: one FinalRec per SKU plus the
// helpers that feed filters, the sent snapshot and the orphaned-override list.
import { finalRec, MIN_STOCK_UNITS, type FinalRec } from "@/lib/inventory/final-rec";
import type { RecSettings } from "@/lib/inventory/rec-settings";
import type { OverrideRow } from "@/lib/inventory/overrides";
import type { SnapshotRowInput } from "@/lib/inventory/snapshot";
import { DEFAULT_BUFFER_PCT } from "@/lib/inventory/buffers";
import type { WindowsResponse } from "@/app/api/sales-summary/inventory/windows/route";

export interface BuildRowInput {
  asin: string;
  sku: string;
  product_name: string;
  main_image_url: string;
  units_90d: number;
  q1_quantity: number;
  current: {
    available: number; inbound_quantity: number; reserved_quantity: number;
    reserved_customerorders?: number; reserved_fc_transfers?: number; reserved_fc_processing?: number;
  } | null;
  health: { total_quantity: number } | null;
  awd_onhand?: number;
  awd_inbound?: number;
  listing_status?: string;
}

/**
 * The stock lines a sent row stores, in the hub cell's buckets (Amazon's
 * hierarchy): On-hand = available + FC transfer; Reserved = customer orders +
 * FC processing (the report's reserved total when there is no breakdown).
 * They add up to stockPosition() for the same product.
 */
export function stockLinesOf(p: BuildRowInput): { available: number; inbound: number; reserved: number; awdAvailable: number; awdInbound: number } {
  const c = p.current;
  const fct = c?.reserved_fc_transfers ?? 0;
  const split = fct + (c?.reserved_customerorders ?? 0) + (c?.reserved_fc_processing ?? 0) > 0;
  return {
    available: (c?.available ?? 0) + (split ? fct : 0),
    inbound: c?.inbound_quantity ?? 0,
    reserved: split ? (c?.reserved_customerorders ?? 0) + (c?.reserved_fc_processing ?? 0) : (c?.reserved_quantity ?? 0),
    awdAvailable: p.awd_onhand ?? 0,
    awdInbound: p.awd_inbound ?? 0,
  };
}

export interface ComputedRow<P extends BuildRowInput = BuildRowInput> {
  p: P;
  key: string;
  stock: number;
  recentUnits: number;
  seasonalUnits: number;
  rec: FinalRec;
  override: OverrideRow | undefined;
  /** Buffer % applied (null on sell-down rows, which carry no recommendation). */
  bufferPct: number | null;
  allMethods: { recent: number; seasonal: number; average: number };
  needsAction: boolean;
  /**
   * Same ASIN, several SKUs: the maths is pooled on the "primary" (send-here)
   * SKU — the one Amazon is receiving inbound for, else the best recent seller —
   * and the others sell down with final 0. `single` = the ASIN's only SKU.
   */
  group: { role: "single" | "primary" | "selldown"; primarySku: string; skus: string[]; pooledStock: number };
}

/** Sell-down rows never ask for stock: their units are pooled into the primary SKU. */
const SELL_DOWN_REC: FinalRec = { basis: 0, floorUnits: 0, liveCalc: 0, final: 0, overridden: false, isOverstock: false, drifted: false };

export type RowFilter = "all" | "needs-action" | "overstock";

export function buildRows<P extends BuildRowInput>(
  products: P[],
  settings: RecSettings,
  windows: WindowsResponse | undefined,
  overrides: Map<string, OverrideRow>,
  stockOf: (p: P) => number,
  /** Per-product buffer % by SKU; a pooled ASIN uses its send-here SKU's. */
  buffers: Map<string, number> = new Map(),
): ComputedRow<P>[] {
  const byAsin = new Map<string, P[]>();
  for (const p of products) {
    const list = byAsin.get(p.asin) ?? [];
    list.push(p);
    byAsin.set(p.asin, list);
  }
  const ownUnits = (p: P) => {
    const w = windows?.units[`${p.asin}|${p.sku}`];
    return windows ? { recent: w?.recent ?? 0, seasonal: w?.seasonal ?? 0 } : { recent: p.units_90d, seasonal: p.q1_quantity };
  };
  const primaryOf = new Map<string, string>();
  for (const [asin, list] of byAsin) {
    if (!asin.trim() || list.length < 2) continue;
    primaryOf.set(asin, pickPrimarySku(list, (p) => ownUnits(p).recent));
  }

  return products.map((p) => {
    const key = `${p.asin}|${p.sku}`;
    const override = overrides.get(p.sku);
    const siblings = p.asin.trim() ? byAsin.get(p.asin) ?? [p] : [p];
    const primarySku = primaryOf.get(p.asin) ?? p.sku;
    const role: ComputedRow["group"]["role"] = siblings.length < 2 ? "single" : p.sku === primarySku ? "primary" : "selldown";
    const stock = stockOf(p);
    const pooledStock = role === "single" ? stock : siblings.reduce((n, s) => n + stockOf(s), 0);
    const group = { role, primarySku, skus: siblings.map((s) => s.sku), pooledStock };

    if (role === "selldown") {
      const own = ownUnits(p);
      return {
        p, key, stock, recentUnits: own.recent, seasonalUnits: own.seasonal, rec: SELL_DOWN_REC, override, bufferPct: null,
        allMethods: { recent: 0, seasonal: 0, average: 0 }, needsAction: false, group,
      };
    }
    // The ASIN's units (old SKUs included) against the ASIN's pooled stock.
    const asinTotal = windows?.byAsin?.[p.asin];
    const recentUnits = asinTotal ? asinTotal.recent : siblings.reduce((n, s) => n + ownUnits(s).recent, 0);
    const seasonalUnits = asinTotal ? asinTotal.seasonal : siblings.reduce((n, s) => n + ownUnits(s).seasonal, 0);
    const bufferPct = buffers.get(p.sku) ?? DEFAULT_BUFFER_PCT;
    // Minimum stock only for active listings — inactive / retired SKUs are never topped up.
    const minStock = (p.listing_status ?? "").toLowerCase() === "active" ? MIN_STOCK_UNITS : 0;
    const input = { recentUnits, seasonalUnits, stock: pooledStock, bufferPct, minStock };
    const rec = finalRec(settings, input, override ?? null);
    const calc = (method: RecSettings["method"]) => finalRec({ method, upliftPct: settings.upliftPct }, input, null).liveCalc;
    return {
      p, key, stock, recentUnits, seasonalUnits, rec, override, bufferPct,
      allMethods: { recent: calc("recent"), seasonal: calc("seasonal"), average: calc("average") },
      // Drift (override far from today's calc) is no longer flagged — the struck
      // calculated number beside the override already shows the gap (2026-10-09).
      needsAction: rec.final > 0 || rec.isOverstock,
      group,
    };
  });
}

/**
 * The send-here SKU of a multi-SKU ASIN: the one with FBA inbound (that is where
 * shipments are going — Halfday's sheet agrees on both clear cases), else the
 * best recent seller, else the first. Most-recent-sales alone is wrong while a
 * duplicate is still selling off its stock (004 vs VAR12PCK-1).
 */
export function pickPrimarySku<P extends BuildRowInput>(list: P[], recentOf: (p: P) => number): string {
  const inbound = (p: P) => p.current?.inbound_quantity ?? 0;
  const best = list.reduce((a, b) => {
    if (inbound(b) !== inbound(a)) return inbound(b) > inbound(a) ? b : a;
    return recentOf(b) > recentOf(a) ? b : a;
  });
  return best.sku;
}

/** Keeps each multi-SKU ASIN together, send-here SKU first, at its first SKU's position. */
export function clusterByAsin<P extends BuildRowInput>(rows: ComputedRow<P>[]): ComputedRow<P>[] {
  const out: ComputedRow<P>[] = [];
  const done = new Set<string>();
  for (const r of rows) {
    if (r.group.role === "single") { out.push(r); continue; }
    if (done.has(r.p.asin)) continue;
    done.add(r.p.asin);
    const cluster = rows.filter((x) => x.p.asin === r.p.asin);
    out.push(...cluster.filter((x) => x.group.role === "primary"), ...cluster.filter((x) => x.group.role !== "primary"));
  }
  return out;
}

export function filterRows<P extends BuildRowInput>(rows: ComputedRow<P>[], f: RowFilter): ComputedRow<P>[] {
  if (f === "needs-action") return rows.filter((r) => r.needsAction);
  if (f === "overstock") return rows.filter((r) => r.rec.isOverstock);
  return rows;
}

// The snapshot API rejects a row with a blank ASIN or SKU, which would block
// the whole send; such rows are left out of the snapshot instead.
function isSendable(r: ComputedRow): boolean {
  return (r.p.asin ?? "").trim() !== "" && (r.p.sku ?? "").trim() !== "";
}

export function countUnsendableRows(rows: ComputedRow[]): number {
  return rows.filter((r) => !isSendable(r)).length;
}

export function toSnapshotRows(rows: ComputedRow[]): SnapshotRowInput[] {
  // A send-here SKU stores its ASIN's pooled lines — the stock its Result was
  // netted against — so the client's sent view adds up like the hub's.
  const lines = (r: ComputedRow) => {
    const own = r.group.role === "primary" ? rows.filter((x) => x.p.asin === r.p.asin) : [r];
    return own.map((x) => stockLinesOf(x.p)).reduce((a, b) => ({
      available: a.available + b.available, inbound: a.inbound + b.inbound, reserved: a.reserved + b.reserved,
      awdAvailable: a.awdAvailable + b.awdAvailable, awdInbound: a.awdInbound + b.awdInbound,
    }));
  };
  return rows.filter(isSendable).map((r) => {
    const { p, stock, rec, override } = r;
    return {
    asin: p.asin,
    sku: p.sku,
    productName: p.product_name ?? "",
    mainImageUrl: p.main_image_url ?? "",
    ...lines(r),
    stockPosition: r.group.role === "primary" ? r.group.pooledStock : stock,
    basisUnits: Math.round(rec.basis),
    liveCalc: rec.liveCalc,
    overrideQty: override?.qty ?? null,
    note: override?.note ?? "",
    final: rec.final,
    };
  });
}

export function orphanedOverrides(rows: ComputedRow[], overrides: Map<string, OverrideRow>): OverrideRow[] {
  const skus = new Set(rows.map((r) => r.p.sku));
  return [...overrides.values()].filter((o) => !skus.has(o.sku));
}
