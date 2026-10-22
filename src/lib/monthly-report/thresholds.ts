// Ported from 1o8hub-monthly-report/references/thresholds.yaml.
// Kept as a const so callers get type-checked access; making this per-client
// configurable is an explicit non-goal of V1.

export const THRESHOLDS = {
  currencySymbol: "$",
  cvr: { good: 12, warning: 7, critical: 4 },
  buyBox: { good: 95, warning: 85, critical: 75 },
  sku: { minSessionsToJudge: 50, zeroSalesWithTraffic: 100 },
} as const;

export type MetricBand = "good" | "warn" | "bad" | "";

/** Returns CSS-friendly band for a value; matches Python `classify_metric` semantics. */
export function classifyMetric(
  value: number | null,
  metric: "cvr" | "buyBox",
): MetricBand {
  if (value === null) return "";
  const t = THRESHOLDS[metric];
  if (value >= t.good) return "good";
  if (value >= t.warning) return "warn";
  if (value < t.critical) return "bad";
  return "warn";
}
