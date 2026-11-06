"use client";

import { useMemo, useState } from "react";
import { Bar, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatKpi, type KpiUnit } from "@/lib/kpi/values";
import { SUMMARY_ROWS } from "@/lib/kpi/sales-summary";
import type { SummaryClient } from "@/lib/kpi/sales-summary-server";
import { cn } from "@/lib/utils";

const GREEN = "#34C759";
const RED = "#FF5C5F";
const BEFORE = "color-mix(in srgb, var(--foreground) 25%, transparent)";

type RankRow = {
  code: string;
  name: string;
  logoFileId: string | null;
  now: number;
  before: number;
  pct: number;
  /** pct held inside the chart's scale, so one outlier doesn't flatten everyone else (the label keeps the real %). */
  plot: number;
  good: boolean;
  unit: KpiUnit;
};
/** The % scale tops out here; bigger changes sit at the edge with their real value. */
const PCT_CAP = 150;

/**
 * Every client's change in one metric vs the period before (MarketFoundry's
 * weekly rank): a column per client, best to worst — the dot is the % change,
 * the bars the two periods, green when it improved and red when it didn't.
 */
export function SalesRankChart({
  clients,
  currentLabel,
  previousLabel,
  onPick,
}: {
  clients: SummaryClient[];
  currentLabel: string;
  previousLabel: string;
  onPick: (code: string) => void;
}) {
  // Metrics some client can be compared on.
  const metrics = useMemo(
    () => SUMMARY_ROWS.filter((r) => clients.some((c) => r.value(c.current) && r.value(c.previous)?.value)),
    [clients],
  );
  const [key, setKey] = useState("net_sales");
  const metric = metrics.find((m) => m.key === key) ?? metrics[0];

  const rows: RankRow[] = useMemo(() => {
    if (!metric) return [];
    return clients
      .map((c) => ({ c, now: metric.value(c.current), before: metric.value(c.previous) }))
      .filter((r) => r.now && r.before && r.before.value !== 0)
      .map(({ c, now, before }) => {
        const pct = ((now!.value - before!.value) / Math.abs(before!.value)) * 100;
        const plot = Math.max(-100, Math.min(PCT_CAP, pct));
        return { code: c.code, name: c.name, logoFileId: c.logoFileId, now: now!.value, before: before!.value, pct, plot, good: metric.lowerIsBetter ? pct <= 0 : pct >= 0, unit: now!.unit };
      })
      .sort((a, b) => (metric.lowerIsBetter ? a.pct - b.pct : b.pct - a.pct));
  }, [clients, metric]);

  if (!metric) return null;
  // % axis in steps of 50 around the dots (at least ±50).
  const lo = Math.min(-50, Math.floor(Math.min(...rows.map((r) => r.plot), 0) / 50) * 50);
  const hi = Math.max(50, Math.ceil(Math.max(...rows.map((r) => r.plot), 0) / 50) * 50);
  const pctTicks = Array.from({ length: (hi - lo) / 50 + 1 }, (_, i) => lo + i * 50);
  const fmt = (v: number, unit: KpiUnit) => formatKpi({ value: v, unit, basis: "" });

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 bg-brand px-5 py-2.5 text-sidebar">
        <h2 className="text-sm font-bold">Client ranking · {metric.label}</h2>
        <span className="text-xs font-semibold tabular-nums">
          {currentLabel} vs {previousLabel} · best to worst
        </span>
      </header>
      <div className="flex flex-col gap-4 p-4 xl:flex-row">
        <fieldset className="shrink-0 xl:w-44">
          <legend className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Metric</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1 xl:flex-col">
            {metrics.map((m) => (
              <label key={m.key} className="inline-flex cursor-pointer items-center gap-1.5">
                <input type="radio" name="rank-metric" checked={m.key === metric.key} onChange={() => setKey(m.key)} className="accent-[var(--brand)]" />
                <span className={cn("text-[11px] leading-tight", m.key === metric.key ? "font-bold text-foreground" : "text-muted-foreground")}>{m.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No client has {metric.label.toLowerCase()} in both periods yet.</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap justify-end gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                <Legend swatch={BEFORE} label={previousLabel} />
                <Legend swatch={`color-mix(in srgb, ${GREEN} 75%, transparent)`} label={`${currentLabel} · better`} />
                <Legend swatch={`color-mix(in srgb, ${RED} 75%, transparent)`} label={`${currentLabel} · worse`} />
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-foreground/70" /> % change
                </span>
              </div>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(560, rows.length * 56) }}>
                  {/* % change: one dot per client, best to worst. */}
                  <ResponsiveContainer width="100%" height={170}>
                    <ComposedChart data={rows} syncId="sales-rank" margin={{ top: 22, right: 8, left: 4, bottom: 0 }}>
                      <XAxis dataKey="code" hide />
                      <YAxis
                        domain={[pctTicks[0], pctTicks.at(-1)!]}
                        ticks={pctTicks}
                        tickFormatter={(v) => `${Math.round(Number(v))}%`}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={64}
                      />
                      <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.35} strokeDasharray="4 4" />
                      {/* Synced with the bars below: one tooltip there, only the cursor here. */}
                      <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.3 }} content={() => null} />
                      <Line
                        type="monotone"
                        dataKey="plot"
                        stroke="var(--foreground)"
                        strokeOpacity={0.25}
                        strokeWidth={2}
                        isAnimationActive={false}
                        dot={(props) => <PctDot key={props.index} {...props} rows={rows} />}
                        activeDot={{ r: 5 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  {/* The two periods' values, with the client's logo under its column. */}
                  <ResponsiveContainer width="100%" height={170}>
                    <ComposedChart data={rows} syncId="sales-rank" margin={{ top: 4, right: 8, left: 4, bottom: 0 }} barGap={2} barCategoryGap="22%">
                      <XAxis dataKey="code" interval={0} tickLine={false} axisLine={false} height={40} tick={<LogoTick rows={rows} onPick={onPick} />} />
                      <YAxis tickFormatter={(v) => fmt(Number(v), rows[0].unit)} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={64} />
                      <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.35 }} content={<RankTooltip rows={rows} currentLabel={currentLabel} previousLabel={previousLabel} />} />
                      <Bar dataKey="before" fill={BEFORE} radius={[3, 3, 0, 0]} maxBarSize={22} onClick={(d) => onPick(String((d as unknown as RankRow).code))} className="cursor-pointer" />
                      <Bar dataKey="now" radius={[3, 3, 0, 0]} maxBarSize={22} onClick={(d) => onPick(String((d as unknown as RankRow).code))} className="cursor-pointer">
                        {rows.map((r) => (
                          <Cell key={r.code} fill={`color-mix(in srgb, ${r.good ? GREEN : RED} 75%, transparent)`} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Client, both periods and the change. */
function RankTooltip({ active, label, rows, currentLabel, previousLabel }: { active?: boolean; label?: string; rows: RankRow[]; currentLabel: string; previousLabel: string }) {
  const r = rows.find((row) => row.code === label);
  if (!active || !r) return null;
  const fmt = (v: number) => formatKpi({ value: v, unit: r.unit, basis: "" });
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{r.name}</p>
      <p className="tabular-nums">
        {currentLabel}: <b>{fmt(r.now)}</b>
      </p>
      <p className="tabular-nums text-muted-foreground">
        {previousLabel}: {fmt(r.before)}
      </p>
      <p className="font-semibold tabular-nums" style={{ color: r.good ? GREEN : RED }}>
        {r.pct > 0 ? "+" : ""}
        {r.pct.toFixed(1)}%
      </p>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2.5 rounded-sm" style={{ background: swatch }} />
      {label}
    </span>
  );
}

/** The % change dot, green or red, with its value above. */
function PctDot({ cx, cy, index, rows }: { cx?: number; cy?: number; index?: number; rows: RankRow[] }) {
  const r = rows[index ?? 0];
  if (cx === undefined || cy === undefined || !r) return null;
  const color = r.good ? GREEN : RED;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4.5} fill={color} />
      <text x={cx} y={cy - 9} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>
        {`${r.pct > 0 ? "+" : ""}${Math.round(r.pct)}%`}
      </text>
    </g>
  );
}

/** The client under its column: logo (Brand Guidelines) or code; click to open its card. */
function LogoTick({ x, y, payload, rows, onPick }: { x?: number; y?: number; payload?: { value: string }; rows: RankRow[]; onPick: (code: string) => void }) {
  const r = rows.find((row) => row.code === payload?.value);
  if (x === undefined || y === undefined || !r) return null;
  const size = 26;
  return (
    <g transform={`translate(${x},${y})`} className="cursor-pointer" onClick={() => onPick(r.code)}>
      <title>{r.name}</title>
      {r.logoFileId ? (
        <image href={`/api/drive/file/${r.logoFileId}`} x={-size / 2} y={4} width={size} height={size} preserveAspectRatio="xMidYMid meet" />
      ) : (
        <>
          <rect x={-size / 2 - 4} y={4} width={size + 8} height={18} rx={4} fill="var(--sidebar)" />
          <text x={0} y={17} textAnchor="middle" fontSize={9} fontWeight={700} fontFamily="monospace" fill="var(--sidebar-foreground)">
            {r.code}
          </text>
        </>
      )}
    </g>
  );
}
