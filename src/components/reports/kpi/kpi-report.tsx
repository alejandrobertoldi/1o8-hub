"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageMetaSlot } from "@/components/layout/page-header-slot";
import { ReportsControlsBar } from "@/components/reports/v2/reports-controls-bar";
import { useReportControls } from "@/components/reports/v2/use-report-controls";
import { delta, type ReportMetric } from "@/lib/kpi/report-metrics";
import { formatKpi } from "@/lib/kpi/values";
import type { KpiSeries } from "@/lib/kpi/series";
import { cn } from "@/lib/utils";

/** The selected client's code (the controls hold its name or code) and its report data. */
export function useKpiSeries() {
  const controls = useReportControls();
  const client = controls.clients.find((c) => c.clientName === controls.selectedClient || c.clientIdCode === controls.selectedClient);
  const code = client?.clientIdCode ?? "";
  const query = useQuery<KpiSeries>({
    queryKey: ["kpi-series", code, controls.start, controls.end],
    queryFn: async () => {
      const res = await fetch(`/api/kpi/series?client=${encodeURIComponent(code)}&start=${controls.start}&end=${controls.end}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not load the report");
      return res.json();
    },
    enabled: !!code,
  });
  return { controls, client, code, ...query };
}

/** Page frame: the shared client + date controls in the header, then the content. */
export function KpiReportPage({ title, children }: { title: string; children: ReactNode }) {
  const controls = useReportControls();
  return (
    <div className="space-y-5">
      <PageMetaSlot>
        <ReportsControlsBar surface="hub" controls={controls} sectionLabel={title} showRefreshButton={false} />
      </PageMetaSlot>
      {children}
    </div>
  );
}

const pct = (d: number) => `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)}%`;

function Delta({ value, lowerIsBetter, label }: { value: number | null; lowerIsBetter?: boolean; label: string }) {
  if (value === null) return <span className="text-muted-foreground">— {label}</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  return (
    <span className={cn(Math.abs(value) < 0.005 ? "text-muted-foreground" : good ? "text-emerald-500" : "text-red-500")}>
      {pct(value)} <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/** One card per metric: value for the range, change vs the previous period and vs last year. */
export function MetricGrid({ metrics, series }: { metrics: ReportMetric[]; series: KpiSeries }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
      {metrics.map((m) => {
        const now = m.compute(series.totals);
        return (
          <div key={m.key} className="rounded-xl border bg-card p-4" title={m.hint}>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{m.label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{now === undefined ? "—" : formatKpi({ value: now, unit: m.unit, basis: "" })}</div>
            <div className="mt-1 flex flex-col text-[11px] tabular-nums">
              <Delta value={delta(now, m.compute(series.previous))} lowerIsBetter={m.lowerIsBetter} label="vs previous period" />
              <Delta value={delta(now, m.compute(series.lastYear))} lowerIsBetter={m.lowerIsBetter} label="vs last year" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Daily chart: one metric as bars, optionally a second as a line on its own axis. */
export function DailyChart({ series, bar, line, title }: { series: KpiSeries; bar: ReportMetric; line?: ReportMetric; title: string }) {
  const data = series.days.map((d) => ({ day: d, bar: bar.compute(series.byDay[d] ?? {}) ?? 0, line: line?.compute(series.byDay[d] ?? {}) ?? null }));
  const fmt = (m: ReportMetric) => (v: number) => formatKpi({ value: v, unit: m.unit, basis: "" });
  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={24} />
            <YAxis yAxisId="bar" tickFormatter={fmt(bar)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={64} />
            {line && <YAxis yAxisId="line" orientation="right" tickFormatter={fmt(line)} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={56} />}
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelFormatter={(d) => shortDay(String(d))}
              formatter={(v, name) => {
                const m = name === "bar" ? bar : line!;
                return [v === null ? "—" : fmt(m)(Number(v)), m.label];
              }}
            />
            <Bar yAxisId="bar" dataKey="bar" fill="var(--brand)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {line && <Line yAxisId="line" dataKey="line" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        <span className="mr-1 inline-block size-2 rounded-sm bg-brand" />
        {bar.label}
        {line && (
          <>
            <span className="ml-3 mr-1 inline-block size-2 rounded-sm bg-sky-400" />
            {line.label}
          </>
        )}
      </p>
    </div>
  );
}

/** Loading / error / no-source states shared by the KPI report pages. */
export function SeriesState({
  code,
  isLoading,
  error,
  series,
  source,
  sourceLabel,
  children,
}: {
  code: string;
  isLoading: boolean;
  error: Error | null;
  series: KpiSeries | undefined;
  source?: string;
  sourceLabel?: string;
  children: (s: KpiSeries) => ReactNode;
}) {
  if (!code) return <p className="text-sm text-muted-foreground">Pick a client.</p>;
  if (error) return <p className="text-sm text-red-500">{error.message}</p>;
  if (isLoading || !series) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (source && !series.sources.includes(source)) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
        No {sourceLabel ?? source} data for this client in this range. Connect it on the client&apos;s profile (Main KPIs → data sources) and run the KPI sync.
      </div>
    );
  }
  return <>{children(series)}</>;
}
