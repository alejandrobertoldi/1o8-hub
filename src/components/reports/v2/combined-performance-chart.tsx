"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
/* eslint-disable react-doctor/no-array-index-as-key */
import { ResponsiveContainer, ComposedChart, Bar, Cell, Line, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import type { OverviewResponse } from "./primitives/kpi-derivations";
import { fmtCurrencyCompact, fmtPct } from "./primitives/kpi-derivations";
import { combinedSeries } from "./primitives/chart-derivations";
import { CHART_DATA, accentFor } from "./primitives/chart-colors";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";

function fmtDay(s: string): string {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

export function CombinedPerformanceChart({ overview, surface }: { overview: OverviewResponse; surface: SurfaceKind }) {
  const accent = accentFor(surface);
  const acosTarget = (overview.acosGoal ?? 0) * 100;
  const data = combinedSeries(overview.daily).map((p) => ({ ...p, date: fmtDay(p.date) }));

  if (data.length === 0) {
    return (
      <Surface title="Combined performance" subtitle="Sales, ad revenue, ad spend & ACoS" className="col-span-12">
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  const summary = (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Total Sales", value: fmtCurrencyCompact(overview.totalSales) },
        { label: "Ad Revenue", value: fmtCurrencyCompact(overview.adRevenue) },
        { label: "Ad Spend", value: fmtCurrencyCompact(overview.adSpend) },
        { label: "ACoS", value: fmtPct(overview.acos) },
      ].map((s) => (
        <div key={s.label}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-mf-muted">{s.label}</div>
          <div className="text-lg font-extrabold tabular-nums text-mf-ink">{s.value}</div>
        </div>
      ))}
    </div>
  );

  const legend = (
    <>
      <LegendDot color={accent} label="Total Sales" />
      <LegendDot color={CHART_DATA.adRevenue} label="Ad Revenue" />
      <LegendDot color={CHART_DATA.adSpend} label="Ad Spend" />
      <span className="flex items-center gap-1">
        <span className="inline-block w-6 border-t border-dashed border-mf-muted" />ACoS target
      </span>
    </>
  );

  return (
    <ChartFrame title="Combined performance" subtitle="Sales, ad revenue, ad spend & ACoS" summary={summary} legend={legend} className="col-span-12">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 6 }} barCategoryGap="12%">
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis yAxisId="left" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} domain={[0, "auto"]} width={40} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmtCurrencyCompact(Number(v))} tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} width={54} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 }}
            formatter={(value, name) => (name === "ACoS" ? [fmtPct(Number(value)), String(name)] : [fmtCurrencyCompact(Number(value)), String(name)])}
          />
          <ReferenceLine yAxisId="left" y={acosTarget} stroke="#6E6C77" strokeDasharray="5 5" />
          <Bar yAxisId="left" dataKey="acos" name="ACoS" barSize={26} opacity={0.85}>
            {data.map((p, i) => (
              <Cell key={`acos-${i}`} fill={p.acos <= acosTarget ? CHART_DATA.adRevenue : "#C73737"} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="sales" name="Total Sales" stroke={accent} strokeWidth={2.25} dot={false} isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey="adRevenue" name="Ad Revenue" stroke={CHART_DATA.adRevenue} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey="adSpend" name="Ad Spend" stroke={CHART_DATA.adSpend} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
