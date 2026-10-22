"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-effect-event-handler */
/* eslint-disable react-doctor/no-fetch-in-effect */
/* eslint-disable react-doctor/no-cascading-set-state */

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";
import { Chip } from "./primitives/chip";
import { KpiCard } from "./primitives/kpi-card";
import { getSurfacePalette, type Surface as SurfaceKind } from "./primitives/palette";
import { accentFor } from "./primitives/chart-colors";
import {
  fmtCurrencyCompact,
  fmtPct,
  fmtRoas,
  fmtInt,
  yoyChipMeta,
  type MetricDirection,
} from "./primitives/kpi-derivations";
import { PeriodComparativeDailyTable, type PeriodDailyRow } from "./period-comparative-daily-table";

interface Totals {
  product_sales: number;
  ad_spend: number;
  ad_revenue: number;
  total_order_items: number;
  product_quantity: number;
  organic_sales: number;
  acos: number;
  roas: number;
  tacos: number;
  avg_units_per_order: number;
  avg_sales_per_order: number;
}

interface ApiResponse {
  daily: PeriodDailyRow[];
  summary: { current: Totals; pm: Totals; py: Totals };
}

type FmtType = "currency" | "pct" | "ratio" | "int" | "decimal";

function applyFmt(n: number, fmt: FmtType): string {
  if (fmt === "currency") return fmtCurrencyCompact(n);
  if (fmt === "pct") return fmtPct(n);
  if (fmt === "int") return fmtInt(n);
  if (fmt === "decimal") return n.toFixed(2);
  return fmtRoas(n);
}

function momPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function fmtDay(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Chart metrics: one metric at a time → one unit, one y-axis (never dual). ──
type ChartMetricKey = "ad_revenue" | "ad_spend" | "organic_sales" | "product_sales" | "acos" | "roas" | "tacos";

interface ChartMetricDef {
  key: ChartMetricKey;
  label: string;
  fmt: FmtType;
  direction: MetricDirection;
}

const CHART_METRICS: ChartMetricDef[] = [
  { key: "ad_revenue", label: "Ad Revenue", fmt: "currency", direction: "higherBetter" },
  { key: "ad_spend", label: "Ad Spend", fmt: "currency", direction: "neutral" },
  { key: "organic_sales", label: "Organic Sales", fmt: "currency", direction: "higherBetter" },
  { key: "product_sales", label: "Product Sales", fmt: "currency", direction: "higherBetter" },
  { key: "acos", label: "ACoS", fmt: "pct", direction: "lowerBetter" },
  { key: "roas", label: "RoAS", fmt: "ratio", direction: "higherBetter" },
  { key: "tacos", label: "TACoS", fmt: "pct", direction: "lowerBetter" },
];

// ── Period entities. Color follows the period, never the metric, so switching
//    metrics never repaints a series. The current period takes the surface
//    accent (dual-accent rule); previous month and previous year are shared.
//    The HUB trio was validated with the dataviz palette validator on the white
//    card surface: worst CVD pair ΔE 22.2 (protan), normal-vision 23.3; PY
//    additionally dashed as secondary encoding. The PORTAL trio substitutes
//    #2C2B35 for the current period, putting teal next to the #006BBB previous
//    month, and has NOT been re-validated — Manu accepted this on 2026-08-03
//    with a dogfood legibility check instead (plan Task 17, spec §9). ──
type PeriodKey = "current" | "pm" | "py";

export interface PeriodSpec {
  key: PeriodKey;
  suffix: "" | "_pm" | "_py";
  label: string;
  color: string;
  width: number;
  dash?: string;
}

export function periodsFor(surface: SurfaceKind): PeriodSpec[] {
  return [
    { key: "current", suffix: "", label: "Current period", color: accentFor(surface), width: 2.25 },
    { key: "pm", suffix: "_pm", label: "Previous month", color: "#006BBB", width: 2 },
    { key: "py", suffix: "_py", label: "Previous year", color: "#05893E", width: 2, dash: "6 4" },
  ];
}

// ── Headline band (5 tiles, same slots as the legacy orange band). ──
const HEADER_METRICS: { label: string; key: keyof Totals; fmt: FmtType; direction: MetricDirection }[] = [
  { label: "Total order items", key: "total_order_items", fmt: "int", direction: "higherBetter" },
  { label: "Units ordered", key: "product_quantity", fmt: "int", direction: "higherBetter" },
  { label: "Ordered product sales", key: "product_sales", fmt: "currency", direction: "higherBetter" },
  { label: "Avg. units/order item", key: "avg_units_per_order", fmt: "decimal", direction: "higherBetter" },
  { label: "Avg. sales/order item", key: "avg_sales_per_order", fmt: "currency", direction: "higherBetter" },
];

// ── Comparison cards (replace the legacy two-slice pies — a two-value pie is a
//    stat tile's job). ──
const COMPARE_CARDS: { label: string; key: keyof Totals; fmt: FmtType; direction: MetricDirection }[] = [
  { label: "Units Ordered", key: "product_quantity", fmt: "int", direction: "higherBetter" },
  { label: "Sales", key: "product_sales", fmt: "currency", direction: "higherBetter" },
  { label: "Organic Sales", key: "organic_sales", fmt: "currency", direction: "higherBetter" },
  { label: "Ad Revenue", key: "ad_revenue", fmt: "currency", direction: "higherBetter" },
  { label: "Ad Spend", key: "ad_spend", fmt: "currency", direction: "neutral" },
  { label: "ACoS", key: "acos", fmt: "pct", direction: "lowerBetter" },
  { label: "RoAS", key: "roas", fmt: "ratio", direction: "higherBetter" },
  { label: "TACoS", key: "tacos", fmt: "pct", direction: "lowerBetter" },
];

function LegendKey({ color, label, dash }: { color: string; label: string; dash?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      {dash ? (
        <span className="inline-block w-6 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      )}
      {label}
    </span>
  );
}

export function PeriodComparativeSection({
  surface,
  accountId,
  start,
  end,
  refreshKey = 0,
}: {
  surface: SurfaceKind;
  accountId: string;
  start: string;
  end: string;
  refreshKey?: number;
}) {
  const palette = getSurfacePalette(surface);
  const periods = periodsFor(surface);
  const requestKey = accountId && start && end ? `${accountId}:${start}:${end}:${refreshKey}` : "";
  const [result, setResult] = useState<{ key: string; data: ApiResponse | null } | null>(null);
  const [metricKey, setMetricKey] = useState<ChartMetricKey>("ad_revenue");
  const [activePeriods, setActivePeriods] = useState<Set<PeriodKey>>(new Set(["current", "pm", "py"]));

  useEffect(() => {
    if (!accountId || !start || !end) return;

    let ignore = false;
    fetch(`/api/reports/period-comparative?accountId=${accountId}&start=${start}&end=${end}`)
      .then((r) => r.json())
      .then((d) => {
        if (!ignore) setResult({ key: requestKey, data: d });
      })
      .catch(() => {
        if (!ignore) setResult({ key: requestKey, data: null });
      });
    return () => {
      ignore = true;
    };
  }, [accountId, start, end, requestKey]);

  const loading = Boolean(requestKey) && result?.key !== requestKey;
  const data = result?.key === requestKey ? result.data : null;

  const metric = CHART_METRICS.find((m) => m.key === metricKey) ?? CHART_METRICS[0];

  const chartData = useMemo(() => {
    if (!data?.daily) return [];
    return data.daily.map((row) => ({
      date: fmtDay(row.report_date),
      current: row[metric.key] ?? 0,
      pm: row[`${metric.key}_pm`] ?? 0,
      py: row[`${metric.key}_py`] ?? 0,
    }));
  }, [data, metric.key]);

  const togglePeriod = (key: PeriodKey) => {
    setActivePeriods((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!requestKey) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Select a client and date range to load the period comparison.</div>
      </Surface>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-[110px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        <div className="h-[520px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`sk-${i}`} className="min-h-[190px] animate-pulse rounded-[18px] border border-black/10 bg-white/60" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.summary) {
    return (
      <Surface>
        <div className="p-[18px] text-mf-muted">Period comparison data is unavailable for this range.</div>
      </Surface>
    );
  }

  const { current, pm, py } = data.summary;

  const summaryStrip = (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
      {periods.map((p) => {
        const value = p.key === "current" ? current[metric.key] : p.key === "pm" ? pm[metric.key] : py[metric.key];
        return (
          <div key={p.key}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-mf-muted">
              <span className="inline-block size-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </div>
            <div className="text-lg font-extrabold text-mf-ink">{applyFmt(value ?? 0, metric.fmt)}</div>
          </div>
        );
      })}
      <div className="flex gap-2 pb-0.5">
        <Chip tone={yoyChipMeta(momPct(current[metric.key], pm[metric.key]), metric.direction).tone}>
          {yoyChipMeta(momPct(current[metric.key], pm[metric.key]), metric.direction).text} MoM
        </Chip>
        <Chip tone={yoyChipMeta(momPct(current[metric.key], py[metric.key]), metric.direction).tone}>
          {yoyChipMeta(momPct(current[metric.key], py[metric.key]), metric.direction).text} YoY
        </Chip>
      </div>
    </div>
  );

  const legend = periods.filter((p) => activePeriods.has(p.key)).map((p) => (
    <LegendKey key={p.key} color={p.color} label={p.label} dash={Boolean(p.dash)} />
  ));

  return (
    <div className="space-y-4">
      {/* Headline band */}
      <Surface>
        <div className="grid grid-cols-2 gap-4 p-[18px] sm:grid-cols-3 lg:grid-cols-5">
          {HEADER_METRICS.map((m) => {
            const chip = yoyChipMeta(momPct(current[m.key] ?? 0, pm[m.key] ?? 0), m.direction);
            return (
              <div key={m.key}>
                <div className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-mf-muted">{m.label}</div>
                <div className="mt-1.5 text-[clamp(22px,1.8vw,30px)] font-extrabold leading-none tracking-[-0.03em] text-mf-ink">
                  {applyFmt(current[m.key] ?? 0, m.fmt)}
                </div>
                <div className="mt-2">
                  <Chip tone={chip.tone}>{chip.text} MoM</Chip>
                </div>
              </div>
            );
          })}
        </div>
      </Surface>

      {/* Daily trend — metric selector left, single-axis chart right */}
      <ChartFrame
        title={`${metric.label} — daily trend`}
        subtitle="Current period vs previous month and previous year"
        summary={summaryStrip}
        legend={legend}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[190px_1fr]">
          <div className="rounded-[12px] bg-mf-ghost p-3">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-mf-muted">Metric</div>
            <div role="radiogroup" aria-label="Chart metric" className="mt-2 flex flex-col gap-1">
              {CHART_METRICS.map((m) => {
                const active = m.key === metric.key;
                return (
                  <button
                    key={m.key}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMetricKey(m.key)}
                    className={`rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      active ? "bg-white font-semibold shadow-[0_2px_8px_rgba(16,34,39,0.08)]" : "text-mf-muted hover:text-mf-ink"
                    }`}
                    style={active ? { color: palette.accent } : undefined}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 border-t border-mf-line pt-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-mf-muted">Periods</div>
              <div className="mt-2 flex flex-col gap-2">
                {periods.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-center gap-2 text-xs text-mf-ink">
                    <input
                      type="checkbox"
                      checked={activePeriods.has(p.key)}
                      onChange={() => togglePeriod(p.key)}
                      className="size-3.5"
                      style={{ accentColor: p.color }}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            {chartData.length === 0 ? (
              <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
            ) : activePeriods.size === 0 ? (
              <div className="flex h-[420px] items-center justify-center text-sm text-mf-muted">
                Select at least one period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={420}>
                <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 6 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} minTickGap={16} />
                  <YAxis
                    tickFormatter={(v) => applyFmt(Number(v), metric.fmt)}
                    tick={{ fontSize: 10, fill: "#6E6C77" }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, "auto"]}
                    width={metric.fmt === "currency" ? 58 : 44}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 }}
                    itemStyle={{ color: "#2C2B35" }}
                    formatter={(value, name) => [applyFmt(Number(value), metric.fmt), String(name)]}
                  />
                  {periods.filter((p) => activePeriods.has(p.key)).map((p) => (
                    <Line
                      key={p.key}
                      type="monotone"
                      dataKey={p.key}
                      name={p.label}
                      stroke={p.color}
                      strokeWidth={p.width}
                      strokeDasharray={p.dash}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </ChartFrame>

      {/* Metric comparison cards (current vs previous month / previous year) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COMPARE_CARDS.map((c) => {
          const chip = yoyChipMeta(momPct(current[c.key] ?? 0, pm[c.key] ?? 0), c.direction);
          return (
          <KpiCard
            key={c.key}
            variant="supporting"
            label={c.label}
            value={applyFmt(current[c.key] ?? 0, c.fmt)}
            chip={{ tone: chip.tone, text: `${chip.text} MoM` }}
            miniStats={[
              { label: "Previous month", value: applyFmt(pm[c.key] ?? 0, c.fmt) },
              { label: "Previous year", value: applyFmt(py[c.key] ?? 0, c.fmt) },
            ]}
            palette={palette}
          />
          );
        })}
      </div>

      {/* Daily detail table */}
      <PeriodComparativeDailyTable daily={data.daily ?? []} />
    </div>
  );
}
