import type { ChipTone } from "./chip";
import type { OverviewResponse } from "./kpi-derivations";
import { fmtCurrencyCompact, fmtPct, fmtRoas, cvrFromCounts } from "./kpi-derivations";

export type InsightKind = "yoy" | "efficiency" | "target-variance" | "traffic-anomaly";

export interface Insight {
  kind: InsightKind;
  /** percentage-magnitude ranking heuristic — NOT a calibrated score. */
  severity: number;
  tone: ChipTone;
  title: string;
  detail: string;
  /** metric keys this insight traces to (traceability + a11y). */
  sourceMetrics: string[];
}

export interface InsightThresholds {
  /** min |YoY %| for a sales-family YoY insight. */
  materialYoYPct: number;
  /** min |CVR or conversions YoY %| for a traffic/conversion anomaly. */
  materialTrafficDropPct: number;
  /** min percent distance from target for a target-variance insight. */
  materialTargetVariancePct: number;
}

export const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  materialYoYPct: 5,
  materialTrafficDropPct: 10,
  materialTargetVariancePct: 5,
};

// Fixed precedence when two insights tie on severity → fully deterministic output.
// Target breaches (vs a goal you set) are the most actionable, so they win ties.
const KIND_RANK: Record<InsightKind, number> = {
  "target-variance": 0,
  efficiency: 1,
  yoy: 2,
  "traffic-anomaly": 3,
};

/** Absolute magnitude as a 1dp percent string, e.g. 16.4 → "16.4%". */
function pctMag(n: number): string {
  return `${Math.abs(n).toFixed(1)}%`;
}

/** Signed 1dp percent with a unicode +/− prefix, e.g. -29.8 → "−29.8%". */
function pctSigned(n: number): string {
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
}

// ── Rule 1: material YoY change — emit the single largest sales-family mover ────
function yoyInsight(d: OverviewResponse, t: InsightThresholds): Insight | null {
  const movers = [
    { key: "totalSales", label: "Sales", value: d.totalSales, py: d.totalSalesPY, yoy: d.yoyPct },
    { key: "organicSales", label: "Organic sales", value: d.organicSales, py: d.organicSalesPY, yoy: d.organicSalesYoYPct },
    { key: "adRevenue", label: "Ad revenue", value: d.adRevenue, py: d.adRevenuePY, yoy: d.adRevenueYoYPct },
  ].filter((m) => m.py > 0); // no PY → the route's 0% YoY is meaningless; never fabricate a move.
  if (movers.length === 0) return null;
  const top = movers.reduce((a, b) => (Math.abs(b.yoy) > Math.abs(a.yoy) ? b : a));
  if (Math.abs(top.yoy) < t.materialYoYPct) return null;
  const up = top.yoy > 0;
  return {
    kind: "yoy",
    severity: Math.abs(top.yoy),
    tone: up ? "positive" : "negative",
    title: `${top.label} ${up ? "up" : "down"} ${pctMag(top.yoy)} YoY`,
    detail: `${fmtCurrencyCompact(top.value)} vs ${fmtCurrencyCompact(top.py)} last year.`,
    sourceMetrics: [top.key],
  };
}

// ── Rule 2: efficiency pressure — spend up while ad revenue down ───────────────
function efficiencyInsight(d: OverviewResponse): Insight | null {
  if (!(d.adSpendPY > 0 && d.adRevenuePY > 0)) return null;
  if (!(d.adSpendYoYPct > 0 && d.adRevenueYoYPct < 0)) return null;
  return {
    kind: "efficiency",
    severity: d.adSpendYoYPct + Math.abs(d.adRevenueYoYPct),
    tone: "negative",
    title: "Ad spend rising while ad revenue falls",
    detail: `Spend ${pctMag(d.adSpendYoYPct)} higher, ad revenue ${pctMag(d.adRevenueYoYPct)} lower YoY.`,
    sourceMetrics: ["adSpend", "adRevenue"],
  };
}

// ── Rule 3: target variance — only metrics with a REAL goal (no fabrication) ───
function targetVarianceInsights(d: OverviewResponse, t: InsightThresholds): Insight[] {
  // value and target MUST share a unit. acosGoal/tacosGoal are fractions → ×100.
  const metrics = [
    { key: "sales", label: "Sales", value: d.totalSales, target: d.salesGoal, higherBetter: true, fmt: fmtCurrencyCompact, guardZeroValue: false },
    { key: "adSpend", label: "Ad spend", value: d.adSpend, target: d.adSpendGoal, higherBetter: false, fmt: fmtCurrencyCompact, guardZeroValue: false },
    { key: "acos", label: "ACoS", value: d.acos, target: (d.acosGoal ?? 0) * 100, higherBetter: false, fmt: (n: number) => fmtPct(n), guardZeroValue: true },
    { key: "tacos", label: "TACoS", value: d.tacos ?? 0, target: (d.tacosGoal ?? 0) * 100, higherBetter: false, fmt: (n: number) => fmtPct(n), guardZeroValue: true },
    { key: "roas", label: "ROAS", value: d.roas, target: d.roasGoal, higherBetter: true, fmt: (n: number) => fmtRoas(n), guardZeroValue: true },
  ];
  const out: Insight[] = [];
  for (const m of metrics) {
    if (!(m.target > 0)) continue;                     // no goal → NEVER fabricate a target (§7 GAP)
    if (m.guardZeroValue && !(m.value > 0)) continue;  // 0 = route no-data collapse → skip
    const breached = m.higherBetter ? m.value < m.target : m.value > m.target;
    if (!breached) continue;
    const severity = (Math.abs(m.value - m.target) / m.target) * 100;
    if (severity < t.materialTargetVariancePct) continue;
    out.push({
      kind: "target-variance",
      severity,
      tone: "negative",
      title: `${m.label} ${m.value > m.target ? "above" : "below"} target`,
      detail: `${m.fmt(m.value)} vs ${m.fmt(m.target)} target.`,
      sourceMetrics: [m.key],
    });
  }
  return out;
}

// ── Rule 4: traffic / conversion anomaly — YoY-based (CVR has no target) ───────
function trafficAnomalyInsight(d: OverviewResponse, t: InsightThresholds): Insight | null {
  const cvrDrop = d.clicksPY > 0 && d.cvrYoYPct < 0 ? Math.abs(d.cvrYoYPct) : 0;
  const convDrop = d.conversionsPY > 0 && (d.conversionsYoYPct ?? 0) < 0 ? Math.abs(d.conversionsYoYPct ?? 0) : 0;
  const severity = Math.max(cvrDrop, convDrop);
  if (severity < t.materialTrafficDropPct) return null;
  const cvrNow = cvrFromCounts(d.conversions, d.clicks);
  const parts: string[] = [];
  if (d.clicksYoYPct != null && d.clicksPY > 0) parts.push(`clicks ${pctSigned(d.clicksYoYPct)}`);
  if (d.conversionsYoYPct != null && d.conversionsPY > 0) parts.push(`conversions ${pctSigned(d.conversionsYoYPct)}`);
  const cvrText = cvrNow == null ? "" : ` CVR ${fmtPct(cvrNow)}.`;
  return {
    kind: "traffic-anomaly",
    severity,
    tone: "negative",
    title: "Conversion momentum weakening",
    detail: `${parts.join(", ")}${parts.length ? " YoY." : ""}${cvrText}`.trim(),
    sourceMetrics: ["cvr", "conversions", "clicks"],
  };
}

export function computeInsights(
  d: OverviewResponse,
  t: InsightThresholds = DEFAULT_INSIGHT_THRESHOLDS,
): Insight[] {
  const candidates: Insight[] = [];
  const y = yoyInsight(d, t); if (y) candidates.push(y);
  const e = efficiencyInsight(d); if (e) candidates.push(e);
  candidates.push(...targetVarianceInsights(d, t));
  const a = trafficAnomalyInsight(d, t); if (a) candidates.push(a);

  // Round the ranking key to 6dp so sub-microscopic float noise (e.g. 20.0000000004
  // vs 19.9999999996 for two "equal" 20% variances) cannot pre-empt the deterministic
  // KIND_RANK/title tiebreak. Stored `severity` stays raw for display.
  const sevKey = (s: number) => Math.round(s * 1e6) / 1e6;
  return candidates
    .sort((p, q) => {
      const bySeverity = sevKey(q.severity) - sevKey(p.severity);                     // severity desc
      if (bySeverity !== 0) return bySeverity;
      if (KIND_RANK[p.kind] !== KIND_RANK[q.kind]) return KIND_RANK[p.kind] - KIND_RANK[q.kind]; // fixed precedence
      return p.title.localeCompare(q.title);                                          // final deterministic tiebreak
    })
    .slice(0, 4);
}
