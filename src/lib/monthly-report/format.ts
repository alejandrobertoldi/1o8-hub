import { THRESHOLDS } from "./thresholds";

const CURRENCY = THRESHOLDS.currencySymbol;

export function fmtMoney(x: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${CURRENCY}${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMoneyShort(x: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const abs = Math.abs(x);
  if (abs >= 1_000_000) return `${CURRENCY}${(x / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${CURRENCY}${(x / 1_000).toFixed(2)}K`;
  return `${CURRENCY}${x.toFixed(2)}`;
}

export function fmtPct(x: number | null, decimals = 2): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${x.toFixed(decimals)}%`;
}

export function fmtInt(x: number | null): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return Math.trunc(x).toLocaleString("en-US");
}

/** Absolute point delta as unsigned percent. Color/glyph carries direction. 0.2 → "0.20%". */
export function fmtPtsDelta(delta: number | null, decimals = 2): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "—";
  return `${Math.abs(delta).toFixed(decimals)}%`;
}

/** Unsigned absolute delta with an arrow. Relative 0.15 → "▲ 15.2%". */
export function fmtDelta(delta: number | null): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "—";
  const pct = delta * 100;
  if (Math.abs(pct) <= 0.05) return "— 0.0%";
  const arrow = pct > 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(pct).toFixed(1)}%`;
}
