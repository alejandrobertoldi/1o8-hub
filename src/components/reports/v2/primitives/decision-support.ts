import type { MetricRow } from "./table-derivations";

export interface DecisionThresholds {
  /** ROAS >= this → scale candidate. */
  roasScaleFloor: number;
  /** ACoS ratio; a row with acos% > ceiling*100 is a risk. */
  acosRiskCeiling: number;
  /** spend > this AND 0 conversions → risk. Dollars. */
  zeroConvSpendFloor: number;
}

export const DEFAULT_THRESHOLDS: DecisionThresholds = {
  roasScaleFloor: 4.0,
  acosRiskCeiling: 0.6,
  zeroConvSpendFloor: 15,
};

/** How many entities each ranking card displays. */
export const TOP_N = 2;

export interface RiskRow extends MetricRow {
  reasons: { highAcos: boolean; zeroConv: boolean };
}

export type ActionKind = "cut-zero-conv" | "cut-high-acos" | "scale-keywords" | "shift-budget";
export interface Action {
  kind: ActionKind;
  text: string;
  count: number;
}

/** Full qualifying list of scale candidates, ROAS desc. Consumer slices to TOP_N. */
export function rankPerformers(rows: MetricRow[], t: DecisionThresholds = DEFAULT_THRESHOLDS): MetricRow[] {
  return rows.filter((r) => r.roas >= t.roasScaleFloor).sort((a, b) => b.roas - a.roas);
}

/** Full qualifying list of efficiency risks, adSpend desc. Consumer slices to TOP_N.
 *  acos is percent-points; the ratio ceiling is scaled to percent (0.60 → 60). */
export function rankRisks(rows: MetricRow[], t: DecisionThresholds = DEFAULT_THRESHOLDS): RiskRow[] {
  const ceilingPct = t.acosRiskCeiling * 100;
  const out: RiskRow[] = [];
  for (const r of rows) {
    const highAcos = r.acos > ceilingPct;
    const zeroConv = r.adSpend > t.zeroConvSpendFloor && r.conversions === 0;
    if (highAcos || zeroConv) out.push({ ...r, reasons: { highAcos, zeroConv } });
  }
  return out.sort((a, b) => b.adSpend - a.adSpend);
}

const plural = (n: number) => (n === 1 ? "" : "s");

/** Concrete next steps derived from the rule outputs. Counts reflect the FULL
 *  qualifying sets (not the TOP_N shown). Waste-first order, capped at 4. */
export function recommendedActions(
  keywordRows: MetricRow[],
  campaignRows: MetricRow[],
  t: DecisionThresholds = DEFAULT_THRESHOLDS,
): Action[] {
  const kwRisks = rankRisks(keywordRows, t);
  const zeroConvCount = kwRisks.filter((r) => r.reasons.zeroConv).length;
  const highAcosCount = kwRisks.filter((r) => r.reasons.highAcos).length;
  const scaleKwCount = rankPerformers(keywordRows, t).length;
  const shiftCount = rankPerformers(campaignRows, t).length;
  const acosPct = Math.round(t.acosRiskCeiling * 100);

  const actions: Action[] = [];
  if (zeroConvCount > 0)
    actions.push({ kind: "cut-zero-conv", count: zeroConvCount,
      text: `Reduce or pause bids on ${zeroConvCount} zero-conversion term${plural(zeroConvCount)} (>$${t.zeroConvSpendFloor} spend, 0 orders).` });
  if (highAcosCount > 0)
    actions.push({ kind: "cut-high-acos", count: highAcosCount,
      text: `Lower bids on ${highAcosCount} term${plural(highAcosCount)} running above ${acosPct}% ACoS.` });
  if (scaleKwCount > 0)
    actions.push({ kind: "scale-keywords", count: scaleKwCount,
      text: `Scale ${scaleKwCount} keyword${plural(scaleKwCount)} at ROAS ≥ ${t.roasScaleFloor} — raise bids/budget.` });
  if (shiftCount > 0)
    actions.push({ kind: "shift-budget", count: shiftCount,
      text: `Shift budget toward ${shiftCount} campaign${plural(shiftCount)} at ROAS ≥ ${t.roasScaleFloor}.` });
  return actions.slice(0, 4);
}
