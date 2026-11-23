import type { KpiUnit } from "@/lib/kpi/values";

/** Full figures for the report ("$12,345", "2.35%", "3.21x"). */
export function fmt(value: number | null | undefined, unit: KpiUnit): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "money": {
      const sign = value < 0 ? "-" : "";
      const abs = Math.abs(value);
      return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: abs >= 100 ? 0 : 2, minimumFractionDigits: abs >= 100 ? 0 : 2 })}`;
    }
    case "percent":
      return `${(value * 100).toFixed(2)}%`;
    case "ratio":
      return `${value.toFixed(2)}x`;
    default:
      return Math.round(value).toLocaleString("en-US");
  }
}

/** Short figures for chart labels ("$12.3k"). */
export function fmtShort(value: number | null, unit: KpiUnit): string {
  if (value === null) return "";
  if (unit === "percent" || unit === "ratio") return fmt(value, unit);
  const abs = Math.abs(value);
  const pre = unit === "money" ? "$" : "";
  if (abs >= 1_000_000) return `${pre}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${pre}${(value / 1_000).toFixed(1)}k`;
  return `${pre}${Math.round(value)}`;
}

export type Change = { text: string; tone: "good" | "bad" | "flat" } | null;

/**
 * Change vs a comparison value: percent change for totals and ratios,
 * percentage points for rates (2.1% → 2.5% is "+0.40 pts", not "+19%").
 */
export function fmtChange(value: number, before: number | null, unit: KpiUnit, lowerIsBetter = false): Change {
  if (before === null || !Number.isFinite(before)) return null;
  // Amounts booked as negatives (discounts, returns): compare their size, so
  // returns growing from $7k to $13k reads "+75%" (and is bad), not "-75%".
  if (value < 0 && before < 0) return fmtChange(-value, -before, unit, !lowerIsBetter);
  let diff: number;
  let text: string;
  if (unit === "percent") {
    diff = (value - before) * 100;
    text = `${diff > 0 ? "+" : ""}${diff.toFixed(2)} pts`;
  } else {
    if (before === 0) return null;
    diff = (value - before) / Math.abs(before);
    text = `${diff > 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`;
  }
  if (Math.abs(diff) < 0.0005) return { text, tone: "flat" };
  const up = diff > 0;
  return { text, tone: up !== lowerIsBetter ? "good" : "bad" };
}
