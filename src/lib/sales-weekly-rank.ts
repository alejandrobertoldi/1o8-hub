export type WeeklyRankMetricKind = "currency" | "pct" | "int" | "dec";

export type WeeklyRankMetric = {
  label: string;
  kind: WeeklyRankMetricKind;
  lowerIsBetter?: boolean;
};

export type WeeklyRankClient = {
  clientIdCode: string;
  clientName: string;
  brandName: string | null;
  accountIds: string[];
  logoSrc: string | null;
  values: Record<string, { current: number | null; previous: number | null }>;
};

export type WeeklyRankRow = {
  clientIdCode: string;
  displayName: string;
  current: number;
  previous: number;
  pctChange: number;
  logoSrc: string | null;
};

/** Week-over-week % change for a metric, sorted best → worst. Skips unconnected or incomparable rows. */
export function buildWeeklyRank(
  clients: WeeklyRankClient[],
  metricLabel: string,
  lowerIsBetter = false,
): WeeklyRankRow[] {
  return clients
    .filter((c) => {
      if (c.accountIds.length === 0) return false;
      const v = c.values[metricLabel];
      return v != null && v.current != null && v.previous != null && v.previous !== 0;
    })
    .map((c) => {
      const v = c.values[metricLabel];
      const current = v.current as number;
      const previous = v.previous as number;
      return {
        clientIdCode: c.clientIdCode,
        displayName: c.brandName || c.clientName,
        current,
        previous,
        pctChange: ((current - previous) / Math.abs(previous)) * 100,
        logoSrc: c.logoSrc,
      };
    })
    .sort((a, b) => {
      const pct = lowerIsBetter ? a.pctChange - b.pctChange : b.pctChange - a.pctChange;
      if (pct !== 0) return pct;
      return lowerIsBetter ? a.current - b.current : b.current - a.current;
    });
}

export function isWeeklyRankImprovement(pctChange: number, lowerIsBetter = false): boolean {
  return lowerIsBetter ? pctChange <= 0 : pctChange >= 0;
}

export function formatPctLabel(n: number): string {
  const rounded = Math.round(n);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function formatPctAbs(n: number): string {
  return `${Math.abs(Math.round(n))}%`;
}

export const WEEKLY_RANK_MAX_BAR = 28;
export const WEEKLY_RANK_MAX_BAR_GAP = 8;
export const WEEKLY_RANK_Y_LEFT = 54;
export const WEEKLY_RANK_Y_RIGHT = 44;

const MAX_PAIR = WEEKLY_RANK_MAX_BAR * 2 + WEEKLY_RANK_MAX_BAR_GAP;

export type WeeklyRankChartLayout = {
  slot: number;
  pairW: number;
  barGap: number;
  maxBar: number;
  categoryGap: string;
  showValues: boolean;
  showNames: boolean;
  showLineLabels: boolean;
  valueH: number;
  nameLines: number;
  maxChars: number;
  nameFont: number;
  axisTickH: number;
};

/** Fit every ranked client in the plot width — never require horizontal scrolling. */
export function weeklyRankChartLayout(plotWidth: number, count: number): WeeklyRankChartLayout {
  const n = Math.max(1, count);
  const slot = Math.max(1, plotWidth) / n;
  const categoryGapPct = slot >= 80 ? 14 : slot >= 52 ? 10 : 6;
  const barGap =
    slot >= 80 ? WEEKLY_RANK_MAX_BAR_GAP : slot >= 52 ? 4 : 2;
  const pairW = Math.min(MAX_PAIR, Math.max(14, slot * (1 - categoryGapPct / 100)));
  const maxBar = Math.max(3, (pairW - barGap) / 2);
  const showValues = slot >= 40;
  const showNames = slot >= 28;
  const showLineLabels = slot >= 56;
  const valueH = showValues ? (slot >= 68 ? 46 : 26) : 0;
  const nameLines = slot >= 70 ? 2 : 1;
  const maxChars = Math.max(4, Math.floor(slot / 6.2));
  const nameFont = slot >= 56 ? 10 : 8;
  const nameBlock = showNames ? 8 + nameLines * (nameFont + 2) : 4;
  const axisTickH = 4 + valueH + 6 + pairW + nameBlock;
  return {
    slot,
    pairW,
    barGap,
    maxBar,
    categoryGap: `${categoryGapPct}%`,
    showValues,
    showNames,
    showLineLabels,
    valueH,
    nameLines,
    maxChars,
    nameFont,
    axisTickH,
  };
}

/** Spread (max ÷ median of non-zero values) above which bars switch to a log axis. */
export const WEEKLY_RANK_LOG_SPREAD = 20;

export type WeeklyRankValueScale = { type: "linear" | "log"; floor: number };

/**
 * One outlier account (e.g. REDCON1 at $450K vs a field under $25K) flattens every
 * other bar on a linear axis. When the spread is that wide, use a log axis whose
 * floor is the power of ten at or below the smallest non-zero value.
 */
export function weeklyRankValueScale(values: number[]): WeeklyRankValueScale {
  const positive = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (positive.length < 2) return { type: "linear", floor: 0 };
  const max = positive[positive.length - 1];
  const mid = Math.floor(positive.length / 2);
  const median = positive.length % 2 ? positive[mid] : (positive[mid - 1] + positive[mid]) / 2;
  if (max / median <= WEEKLY_RANK_LOG_SPREAD) return { type: "linear", floor: 0 };
  return { type: "log", floor: 10 ** Math.floor(Math.log10(positive[0])) };
}
