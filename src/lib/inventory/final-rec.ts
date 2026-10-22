// The ONE number per SKU the team sends. Integer maths on purpose:
// Math.ceil(100 * 1.1) === 111 in JS, so the buffer is written as *(100+pct)/100.
import type { RecMethod, RecSettings } from "./rec-settings";
import { DEFAULT_BUFFER_PCT } from "./buffers";

export const DRIFT_THRESHOLD = 0.25;
/** Active products are always topped up to at least this many units after sending. */
export const MIN_STOCK_UNITS = 100;

export interface FinalRecInput {
  recentUnits: number;
  seasonalUnits: number;
  stock: number;
  /** Safety buffer on the basis, per product; default DEFAULT_BUFFER_PCT (0%). */
  bufferPct?: number;
  /** Stock floor after sending (MIN_STOCK_UNITS for active listings, else 0). */
  minStock?: number;
}

export interface FinalRec {
  basis: number;
  /** Units the minimum-stock floor added on top of basis + buffer (0 when it didn't bite). */
  floorUnits: number;
  liveCalc: number;
  final: number;
  overridden: boolean;
  isOverstock: boolean;
  drifted: boolean;
}

export function basisFor(method: RecMethod, recentUnits: number, seasonalUnits: number): number {
  if (method === "recent") return recentUnits;
  if (method === "seasonal") return seasonalUnits;
  if (method === "greater") return Math.max(recentUnits, seasonalUnits);
  const sides = [recentUnits, seasonalUnits].filter((v) => v > 0);
  return sides.length === 0 ? 0 : sides.reduce((a, b) => a + b, 0) / sides.length;
}

export function liveCalcFor(basis: number, stock: number, upliftPct: number, bufferPct = DEFAULT_BUFFER_PCT, minStock = 0): number {
  // Target = basis + buffer, never below the minimum stock floor.
  const target = Math.max(Math.ceil((basis * (100 + bufferPct)) / 100), minStock);
  const shortfall = target - stock;
  return shortfall > 0 ? Math.ceil((shortfall * (100 + upliftPct)) / 100) : shortfall;
}

export function isDrifted(overrideQty: number, liveCalc: number): boolean {
  return Math.abs(overrideQty - liveCalc) / Math.max(Math.abs(liveCalc), 1) > DRIFT_THRESHOLD;
}

export function finalRec(
  s: Pick<RecSettings, "method" | "upliftPct">,
  input: FinalRecInput,
  override: { qty: number } | null,
): FinalRec {
  const basis = basisFor(s.method, input.recentUnits, input.seasonalUnits);
  const liveCalc = liveCalcFor(basis, input.stock, s.upliftPct, input.bufferPct, input.minStock);
  const final = override ? override.qty : liveCalc;
  const withBuffer = Math.ceil((basis * (100 + (input.bufferPct ?? DEFAULT_BUFFER_PCT))) / 100);
  return {
    basis,
    floorUnits: Math.max(0, (input.minStock ?? 0) - withBuffer),
    liveCalc,
    final,
    overridden: override !== null,
    isOverstock: final < 0,
    drifted: override !== null && isDrifted(override.qty, liveCalc),
  };
}
