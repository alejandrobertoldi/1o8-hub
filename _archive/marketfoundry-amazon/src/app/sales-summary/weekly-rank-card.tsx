"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtCurrency, fmtDec, fmtInt, fmtPct } from "@/lib/formatters";
import {
  buildWeeklyRank,
  formatPctAbs,
  isWeeklyRankImprovement,
  weeklyRankChartLayout,
  weeklyRankValueScale,
  WEEKLY_RANK_Y_LEFT,
  WEEKLY_RANK_Y_RIGHT,
  type WeeklyRankChartLayout,
  type WeeklyRankClient,
  type WeeklyRankMetric,
  type WeeklyRankMetricKind,
  type WeeklyRankRow,
} from "@/lib/sales-weekly-rank";

const GREEN = "#34C759";
const RED = "#FF5C5F";
const NEUTRAL = "var(--foreground)";
const LAST_WEEK = "color-mix(in srgb, var(--foreground) 28%, transparent)";
const THIS_WEEK = "color-mix(in srgb, var(--foreground) 52%, transparent)";

function isFlatTrend(pctChange: number): boolean {
  return Math.round(pctChange) === 0;
}

function trendBarFill(pctChange: number, lowerIsBetter: boolean, week: "previous" | "current"): string {
  if (isFlatTrend(pctChange)) return week === "previous" ? LAST_WEEK : THIS_WEEK;
  const color = isWeeklyRankImprovement(pctChange, lowerIsBetter) ? GREEN : RED;
  const mix = week === "previous" ? 38 : 78;
  return `color-mix(in srgb, ${color} ${mix}%, transparent)`;
}
const CHART_MARGIN_X = { right: 8, left: 4 } as const;
const RADIO_CLASS =
  "accent-[#F7BF1D] appearance-none size-3.5 rounded-full border-2 border-border checked:border-[#F7BF1D] checked:bg-[#F7BF1D] bg-white shrink-0";

const GRID_STROKE = "var(--border)";
const GRID_STROKE_W = 1;

type BarShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  background?: { y?: number | null; height?: number | null };
};

/** Vertical guide through the gap between last-week and this-week bars. */
function GapGuideShape({
  x,
  y,
  width,
  height,
  fill,
  drawBar,
  background,
  barGap,
}: BarShapeProps & { drawBar: boolean; barGap: number }) {
  if (x == null || width == null) return null;
  const midX = x + width + barGap / 2;
  const barH = Math.max(height ?? 0, 0);
  const barY = y ?? 0;
  const lineY1 = background?.y ?? 0;
  const lineY2 =
    background?.y != null && background.height != null ? background.y + background.height : barY + barH;
  return (
    <g pointerEvents="none">
      {drawBar && barH > 0 ? (
        width >= 8 ? (
          <path
            d={`M ${x},${barY + barH} L ${x},${barY + 3} Q ${x},${barY} ${x + 3},${barY} L ${x + width - 3},${barY} Q ${x + width},${barY} ${x + width},${barY + 3} L ${x + width},${barY + barH} Z`}
            fill={fill}
          />
        ) : (
          <rect x={x} y={barY} width={width} height={barH} fill={fill} />
        )
      ) : null}
      <line
        x1={midX}
        x2={midX}
        y1={lineY1}
        y2={lineY2}
        stroke={GRID_STROKE}
        strokeWidth={GRID_STROKE_W}
      />
    </g>
  );
}

function formatValue(n: number, kind: WeeklyRankMetricKind): string {
  if (kind === "currency") return fmtCurrency(n);
  if (kind === "pct") return fmtPct(n);
  if (kind === "dec") return fmtDec(n);
  return fmtInt(n);
}

function fmtAxisValue(n: number, kind: WeeklyRankMetricKind): string {
  const abs = Math.abs(n);
  if (kind === "currency") {
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${Math.round(n)}`;
  }
  if (kind === "pct") return `${n.toFixed(2)}%`;
  if (kind === "dec") return n.toFixed(2);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function TrendIcon({
  pctChange,
  size = 14,
  className,
  color,
  x,
  y,
}: {
  pctChange: number;
  size?: number;
  className?: string;
  color?: string;
  x?: number;
  y?: number;
}) {
  const Icon = isFlatTrend(pctChange) ? Minus : pctChange > 0 ? TrendingUp : TrendingDown;
  return <Icon x={x} y={y} size={size} color={color} className={className} strokeWidth={2.5} />;
}

function RankTooltip({
  active,
  payload,
  kind,
  lowerIsBetter,
  currentLabel,
  previousLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: WeeklyRankRow }>;
  kind: WeeklyRankMetricKind;
  lowerIsBetter: boolean;
  currentLabel: string;
  previousLabel: string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  const flat = isFlatTrend(row.pctChange);
  const good = isWeeklyRankImprovement(row.pctChange, lowerIsBetter);
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-bold text-foreground">{row.displayName}</div>
      <div className="font-mono text-[10px] text-muted-foreground">{row.clientIdCode}</div>
      <div className="mt-1 tabular-nums text-muted-foreground">
        <span className="font-bold tabular-nums text-foreground">{currentLabel}</span> {formatValue(row.current, kind)}
      </div>
      <div className="tabular-nums text-muted-foreground">
        <span className="font-bold tabular-nums text-foreground">{previousLabel}</span> {formatValue(row.previous, kind)}
      </div>
      <div
        className={`mt-0.5 inline-flex items-center gap-0.5 font-bold tabular-nums ${flat ? "text-foreground" : good ? "text-brand-green" : "text-brand-red"}`}
      >
        <TrendIcon pctChange={row.pctChange} size={14} className="shrink-0" />
        {formatPctAbs(row.pctChange)}
      </div>
    </div>
  );
}

function TrendLineLabel({
  x,
  y,
  value,
  color,
}: {
  x?: number | string;
  y?: number | string;
  value?: number | null;
  color: string;
}) {
  if (x == null || y == null || typeof value !== "number" || !Number.isFinite(value)) return null;
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  const pct = formatPctAbs(value);
  const labelY = value >= 0 ? py - 12 : py + 14;
  const iconSize = 12;
  const padX = 5;
  const gap = 1;
  const textW = Math.max(22, pct.length * 6.6);
  const width = padX + iconSize + gap + textW + padX;
  const height = 16;
  const startX = px - width / 2;
  const iconX = startX + padX;
  const iconY = labelY - iconSize / 2;
  return (
    <g pointerEvents="none">
      <rect
        x={startX}
        y={labelY - height / 2}
        width={width}
        height={height}
        rx={3}
        fill="var(--card)"
        stroke={color}
        strokeWidth={1}
      />
      <TrendIcon pctChange={value} size={iconSize} color={color} x={iconX} y={iconY} />
      <text
        x={iconX + iconSize + gap}
        y={labelY}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={700}
        fill={color}
        className="tabular-nums"
      >
        {pct}
      </text>
    </g>
  );
}

function useChartWidth(ref: React.RefObject<HTMLDivElement | null>, fallback = 800) {
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const next = el.clientWidth;
      if (next > 0) setWidth(next);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return width;
}

const PCT_TICKS = [-100, -50, 0, 50, 100];

function wrapAxisName(name: string, maxChars = 11, maxLines = 2): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [name];
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (lines.length >= maxLines - 1) {
      line = [word, ...words.slice(i + 1)].join(" ");
      break;
    }
    line = word;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines).map((l) => (l.length > maxChars ? `${l.slice(0, Math.max(1, maxChars - 1))}…` : l));
}

function ClientAxisTick({
  x,
  y,
  payload,
  rows,
  kind,
  layout,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  rows: WeeklyRankRow[];
  kind: WeeklyRankMetricKind;
  layout: WeeklyRankChartLayout;
}) {
  if (x == null || y == null || payload?.value == null) return null;
  const row = rows.find((r) => r.clientIdCode === payload.value);
  const name = row?.displayName ?? payload.value;
  const logoSrc = row?.logoSrc;
  const lines =
    layout.showNames || !logoSrc
      ? wrapAxisName(
          layout.showNames ? name : row?.clientIdCode ?? name,
          layout.maxChars,
          layout.showNames ? layout.nameLines : 1,
        )
      : [];
  const pairW = layout.pairW;
  const barW = (pairW - layout.barGap) / 2;
  const prevCx = -pairW / 2 + barW / 2;
  const currCx = pairW / 2 - barW / 2;
  const valueY = 6;
  const logoY = layout.showValues ? 6 + layout.valueH : 4;
  const nameY = logoSrc ? logoY + pairW + 8 : logoY + 8;
  const valueFont = layout.slot >= 68 ? 9 : 8;

  const axisValue = (cx: number, value: number | undefined) => {
    if (!layout.showValues || value == null || value <= 0) return null;
    return (
      <text
        x={cx}
        y={valueY}
        transform={`rotate(90 ${cx} ${valueY})`}
        textAnchor="start"
        dominantBaseline="middle"
        fontSize={valueFont}
        fontWeight={700}
        fill="var(--foreground)"
        className="tabular-nums"
      >
        {fmtAxisValue(value, kind)}
      </text>
    );
  };

  return (
    <g transform={`translate(${x},${y})`}>
      {axisValue(prevCx, row?.previous)}
      {axisValue(currCx, row?.current)}
      {logoSrc ? (
        <image
          href={logoSrc}
          x={-pairW / 2}
          y={logoY}
          width={pairW}
          height={pairW}
          preserveAspectRatio="xMidYMid meet"
          className="brightness-0 dark:invert"
        />
      ) : null}
      {lines.map((line, i) => (
        <text
          key={`${line}-${i}`}
          x={0}
          y={nameY + i * (layout.nameFont + 2)}
          textAnchor="middle"
          fontSize={layout.nameFont}
          fontWeight={600}
          fill="var(--muted-foreground)"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

function InsightCard({
  swatch,
  title,
  row,
  empty,
  kind,
  lowerIsBetter,
}: {
  swatch: string;
  title: string;
  row: WeeklyRankRow | null;
  empty: string;
  kind: WeeklyRankMetricKind;
  lowerIsBetter: boolean;
}) {
  const good = row ? isWeeklyRankImprovement(row.pctChange, lowerIsBetter) : true;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: swatch }} />
        <p className="text-sm font-bold text-foreground">{title}</p>
      </div>
      {row ? (
        <>
          <div className="mt-2 flex items-center gap-2.5">
            {row.logoSrc ? (
              <div className="size-16 shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.logoSrc}
                  alt={`${row.displayName} logo`}
                  className="h-full w-full object-contain brightness-0 dark:invert"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.displayName}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{row.clientIdCode}</p>
            </div>
          </div>
          <p
            className="mt-1 inline-flex items-center gap-1 text-lg font-bold tabular-nums leading-none"
            style={{ color: good ? GREEN : RED }}
          >
            <TrendIcon pctChange={row.pctChange} size={16} className="shrink-0" />
            {formatPctAbs(row.pctChange)}
          </p>
          <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
            {formatValue(row.current, kind)} vs {formatValue(row.previous, kind)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

export function WeeklyRankCard({
  clients,
  metrics,
  mode,
  periodLabel,
  previousPeriodLabel,
}: {
  clients: WeeklyRankClient[];
  metrics: WeeklyRankMetric[];
  mode: "week" | "custom";
  periodLabel: string;
  previousPeriodLabel: string;
}) {
  const defaultMetric = metrics[0]?.label ?? "Sales";
  const [metricLabel, setMetricLabel] = useState(defaultMetric);
  const selected = metrics.find((m) => m.label === metricLabel) ?? metrics[0];
  const kind = selected?.kind ?? "currency";
  const lowerIsBetter = Boolean(selected?.lowerIsBetter);

  const rows = useMemo(
    () => buildWeeklyRank(clients, selected?.label ?? defaultMetric, lowerIsBetter),
    [clients, selected?.label, defaultMetric, lowerIsBetter],
  );
  const best = rows[0] ?? null;
  const worst = rows.length ? rows[rows.length - 1] : null;
  const gotWorse = worst
    ? lowerIsBetter
      ? worst.pctChange > 0
      : worst.pctChange < 0
    : false;
  const decline = gotWorse ? worst : null;

  const maxValue = Math.max(...rows.flatMap((r) => [r.current, r.previous]), 0);
  const maxAbsPct = Math.max(...rows.map((r) => Math.abs(r.pctChange)), 0);
  const valuePad = maxValue * 1.15;
  const pctBound = Math.max(100, maxAbsPct);
  const valueScale = weeklyRankValueScale(rows.flatMap((r) => [r.current, r.previous]));
  const valueDomain: [number, number] =
    valueScale.type === "log" ? [valueScale.floor, maxValue * 1.6] : [0, valuePad];
  const valueTicks =
    valueScale.type === "log"
      ? Array.from(
          { length: Math.floor(Math.log10(valueDomain[1] / valueScale.floor)) + 1 },
          (_, i) => valueScale.floor * 10 ** i,
        )
      : undefined;
  const pctDomain: [number, number] = [-pctBound, pctBound];
  const chartRef = useRef<HTMLDivElement>(null);
  const chartWidth = useChartWidth(chartRef);
  const plotWidth = Math.max(
    1,
    chartWidth - WEEKLY_RANK_Y_LEFT - WEEKLY_RANK_Y_RIGHT - CHART_MARGIN_X.left - CHART_MARGIN_X.right,
  );
  const layout = weeklyRankChartLayout(plotWidth, rows.length);
  const chartRows = useMemo(
    () =>
      rows.map((r) => {
        const flat = isFlatTrend(r.pctChange);
        const good = !flat && isWeeklyRankImprovement(r.pctChange, lowerIsBetter);
        return {
          ...r,
          pctGood: good ? r.pctChange : null,
          pctBad: !flat && !good ? r.pctChange : null,
          pctZero: flat ? r.pctChange : null,
          // Log axes can't plot 0 — clamp to the floor so the bar is a stub, not a gap.
          previousPlot: valueScale.type === "log" ? Math.max(r.previous, valueScale.floor) : r.previous,
          currentPlot: valueScale.type === "log" ? Math.max(r.current, valueScale.floor) : r.current,
          _slotL: 1,
          _slotR: 1,
        };
      }),
    [rows, lowerIsBetter, valueScale.type, valueScale.floor],
  );

  const vsLabel = mode === "week" ? "Last Week" : "Previous Period";
  const previousSeriesName = previousPeriodLabel;
  const currentSeriesName = periodLabel;
  const metricName = selected?.label ?? "Sales";

  return (
    <div data-testid="weekly-rank-card" className="mt-6 lg:mt-8 mb-6 animate-card-enter">
      <div
        className="flex flex-wrap items-end justify-between gap-2 rounded-t-xl bg-[#F7BF1D] px-5 pt-3 pb-2"
        style={{ boxShadow: "0 0 0 2px black" }}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <h2 className="text-xl font-bold leading-tight tracking-tight text-white font-[family-name:var(--font-outfit)]">
            Weekly Rank
          </h2>
          <span className="text-sm font-bold tabular-nums text-white/90">
            {periodLabel} vs {previousPeriodLabel}
          </span>
        </div>
        <p className="hidden shrink-0 text-[11px] text-white/80 sm:block">
          Current vs {vsLabel}, sorted best to worst
        </p>
      </div>

      <div className="glass-card rounded-b-xl px-5 pt-5 pb-3" style={{ boxShadow: "0 0 0 2px black", border: "none" }}>
        <div className="flex flex-col gap-4 xl:flex-row">
          {metrics.length > 0 && (
            <fieldset className="w-full shrink-0 xl:w-[168px]">
              <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Metric
              </legend>
              <div className="flex flex-wrap gap-x-3 gap-y-1 xl:flex-col xl:gap-1">
                {metrics.map((metric) => {
                  const checked = metric.label === metricName;
                  return (
                    <label key={metric.label} className="inline-flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name="weekly-rank-metric"
                        value={metric.label}
                        checked={checked}
                        onChange={() => setMetricLabel(metric.label)}
                        className={RADIO_CLASS}
                      />
                      <span
                        className={`text-[11px] leading-tight ${checked ? "font-bold text-foreground" : "text-muted-foreground"}`}
                      >
                        {metric.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="min-w-0 flex-1">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No comparable week-over-week {metricName.toLowerCase()} yet for these accounts.
          </p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-sm" style={{ background: LAST_WEEK }} />
                  <span className="tabular-nums">{previousSeriesName}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2.5 rounded-sm" style={{ background: THIS_WEEK }} />
                  <span className="tabular-nums">{currentSeriesName}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-[2px] w-3.5"
                    style={{ background: lowerIsBetter ? RED : GREEN }}
                  />
                  Up
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-[2px] w-3.5"
                    style={{ background: lowerIsBetter ? GREEN : RED }}
                  />
                  Down
                </span>
              </div>
              <div
                ref={chartRef}
                data-testid="weekly-rank-chart-fit"
                data-client-count={rows.length}
                className="w-full min-w-0"
              >
                <ResponsiveContainer width="100%" height={layout.showLineLabels ? 220 : 180}>
                  <ComposedChart
                    syncId="weekly-rank"
                    data={chartRows}
                    barCategoryGap={layout.categoryGap}
                    barGap={layout.barGap}
                    margin={{ top: layout.showLineLabels ? 28 : 16, ...CHART_MARGIN_X, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="clientIdCode"
                      type="category"
                      padding={{ left: 0, right: 0 }}
                      interval={0}
                      tick={false}
                      tickLine={false}
                      axisLine={false}
                      height={0}
                    />
                    <YAxis
                      yAxisId="pct"
                      orientation="left"
                      domain={pctDomain}
                      ticks={PCT_TICKS}
                      interval={0}
                      tickFormatter={(v) => `${Number(v)}%`}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={WEEKLY_RANK_Y_LEFT}
                    />
                    <YAxis
                      yAxisId="pad"
                      orientation="right"
                      domain={[0, 1]}
                      width={WEEKLY_RANK_Y_RIGHT}
                      tick={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                      content={
                        <RankTooltip
                          kind={kind}
                          lowerIsBetter={lowerIsBetter}
                          currentLabel={currentSeriesName}
                          previousLabel={previousSeriesName}
                        />
                      }
                    />
                    <ReferenceLine
                      yAxisId="pct"
                      y={0}
                      stroke={NEUTRAL}
                      strokeOpacity={0.4}
                      strokeDasharray="4 4"
                      strokeWidth={1}
                    />
                    <Bar
                      yAxisId="pad"
                      dataKey="_slotL"
                      maxBarSize={layout.maxBar}
                      fill="transparent"
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={false}
                      shape={(props) => (
                        <GapGuideShape {...props} drawBar={false} barGap={layout.barGap} />
                      )}
                    />
                    <Bar
                      yAxisId="pad"
                      dataKey="_slotR"
                      maxBarSize={layout.maxBar}
                      fill="transparent"
                      legendType="none"
                      tooltipType="none"
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="pctChange"
                      stroke={NEUTRAL}
                      strokeOpacity={0.22}
                      strokeWidth={2}
                      dot={false}
                      activeDot={false}
                      legendType="none"
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="pctGood"
                      stroke={GREEN}
                      strokeWidth={2.5}
                      dot={{ r: layout.showLineLabels ? 3.5 : 2.5, fill: GREEN, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: GREEN, strokeWidth: 0 }}
                      connectNulls={false}
                      legendType="none"
                      isAnimationActive={false}
                    >
                      {layout.showLineLabels ? (
                        <LabelList dataKey="pctGood" content={<TrendLineLabel color={GREEN} />} />
                      ) : null}
                    </Line>
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="pctBad"
                      stroke={RED}
                      strokeWidth={2.5}
                      dot={{ r: layout.showLineLabels ? 3.5 : 2.5, fill: RED, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: RED, strokeWidth: 0 }}
                      connectNulls={false}
                      legendType="none"
                      isAnimationActive={false}
                    >
                      {layout.showLineLabels ? (
                        <LabelList dataKey="pctBad" content={<TrendLineLabel color={RED} />} />
                      ) : null}
                    </Line>
                    <Line
                      yAxisId="pct"
                      type="monotone"
                      dataKey="pctZero"
                      stroke={NEUTRAL}
                      strokeWidth={2.5}
                      dot={{ r: layout.showLineLabels ? 3.5 : 2.5, fill: NEUTRAL, strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: NEUTRAL, strokeWidth: 0 }}
                      connectNulls={false}
                      legendType="none"
                      isAnimationActive={false}
                    >
                      {layout.showLineLabels ? (
                        <LabelList dataKey="pctZero" content={<TrendLineLabel color={NEUTRAL} />} />
                      ) : null}
                    </Line>
                  </ComposedChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height={280 + layout.axisTickH}>
                  <ComposedChart
                    syncId="weekly-rank"
                    data={chartRows}
                    barCategoryGap={layout.categoryGap}
                    barGap={layout.barGap}
                    margin={{ top: 0, ...CHART_MARGIN_X, bottom: 4 }}
                  >
                    <XAxis
                      dataKey="clientIdCode"
                      type="category"
                      padding={{ left: 0, right: 0 }}
                      interval={0}
                      tick={<ClientAxisTick rows={rows} kind={kind} layout={layout} />}
                      tickLine={false}
                      axisLine={false}
                      height={layout.axisTickH}
                    />
                    <YAxis
                      yAxisId="value"
                      scale={valueScale.type}
                      domain={valueDomain}
                      allowDataOverflow={valueScale.type === "log"}
                      ticks={valueTicks}
                      tickFormatter={(v) => fmtAxisValue(Number(v), kind)}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={WEEKLY_RANK_Y_LEFT}
                    />
                    <YAxis
                      yAxisId="pad"
                      orientation="right"
                      width={WEEKLY_RANK_Y_RIGHT}
                      tick={false}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                      content={
                        <RankTooltip
                          kind={kind}
                          lowerIsBetter={lowerIsBetter}
                          currentLabel={currentSeriesName}
                          previousLabel={previousSeriesName}
                        />
                      }
                    />
                    <Bar
                      yAxisId="value"
                      dataKey="previousPlot"
                      name={previousSeriesName}
                      maxBarSize={layout.maxBar}
                      shape={(props) => <GapGuideShape {...props} drawBar barGap={layout.barGap} />}
                    >
                      {chartRows.map((r) => (
                        <Cell
                          key={`prev-${r.clientIdCode}`}
                          fill={trendBarFill(r.pctChange, lowerIsBetter, "previous")}
                        />
                      ))}
                    </Bar>
                    <Bar
                      yAxisId="value"
                      dataKey="currentPlot"
                      name={currentSeriesName}
                      maxBarSize={layout.maxBar}
                      radius={layout.maxBar >= 10 ? [3, 3, 0, 0] : [1, 1, 0, 0]}
                    >
                      {chartRows.map((r) => (
                        <Cell
                          key={`curr-${r.clientIdCode}`}
                          fill={trendBarFill(r.pctChange, lowerIsBetter, "current")}
                        />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <InsightCard
                swatch={GREEN}
                title="Best performer"
                row={best}
                empty="No ranked accounts this period."
                kind={kind}
                lowerIsBetter={lowerIsBetter}
              />
              <InsightCard
                swatch={RED}
                title="Steepest decline"
                row={decline}
                empty="No declines this period."
                kind={kind}
                lowerIsBetter={lowerIsBetter}
              />
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
