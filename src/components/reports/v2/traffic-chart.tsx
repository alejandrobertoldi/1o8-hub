"use client";
/* eslint-disable react-doctor/prefer-dynamic-import */
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip } from "recharts";
import type { OverviewResponse } from "./primitives/kpi-derivations";
import { fmtPct, fmtInt } from "./primitives/kpi-derivations";
import { trafficSeries } from "./primitives/chart-derivations";
import { CHART_DATA, accentFor } from "./primitives/chart-colors";
import type { Surface as SurfaceKind } from "./primitives/palette";
import { Surface } from "./primitives/surface";
import { ChartFrame } from "./primitives/chart-frame";

function fmtDay(s: string): string {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtLarge(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return fmtInt(n);
}

export function TrafficChart({ overview, surface }: { overview: OverviewResponse; surface: SurfaceKind }) {
  const accent = accentFor(surface);
  const data = trafficSeries(overview.daily).map((p) => ({ ...p, date: fmtDay(p.date) }));

  const tools = (
    <div className="rounded-md border border-mf-line px-3 py-1.5 text-right">
      <div className="text-[10px] font-bold uppercase tracking-wide text-mf-muted">CTR</div>
      <div className="text-sm font-extrabold tabular-nums text-mf-ink">{fmtPct(overview.ctr ?? 0)}</div>
    </div>
  );

  if (data.length === 0) {
    return (
      <Surface title="Clicks, impressions & CTR" tools={tools} className="col-span-12 lg:col-span-6">
        <div className="p-[18px] text-xs text-mf-muted">No available data for the period.</div>
      </Surface>
    );
  }

  return (
    <ChartFrame title="Clicks, impressions & CTR" tools={tools} className="col-span-12 lg:col-span-6">
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 6 }} barCategoryGap="18%">
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis yAxisId="left" tickFormatter={fmtLarge} tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} width={46} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: "#6E6C77" }} tickLine={false} axisLine={false} width={40} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid #D8D7DC", fontSize: 11 }}
            formatter={(value, name) => (name === "CTR" ? [fmtPct(Number(value)), String(name)] : [fmtLarge(Number(value)), String(name)])}
          />
          <Bar yAxisId="left" dataKey="impressions" name="Impressions" fill={CHART_DATA.impressions} opacity={0.75} barSize={22} />
          <Line yAxisId="left" type="monotone" dataKey="clicks" name="Clicks" stroke={accent} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line yAxisId="right" type="monotone" dataKey="ctr" name="CTR" stroke={CHART_DATA.cvrCtr} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
