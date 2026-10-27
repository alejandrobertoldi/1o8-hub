"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtHM, type AgencyBreakdown } from "@/lib/hours/dashboard-utils";

const CARD = "rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800";
const TOOLTIP_STYLE = {
  background: "var(--popover, var(--background))",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  fontSize: 12,
} as const;

function fmtPct(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

function StackTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => Number(p.value) > 0);
  if (items.length === 0) return null;
  const total = items.reduce((acc, p) => acc + Number(p.value), 0);
  return (
    <div style={TOOLTIP_STYLE} className="px-2 py-1.5">
      <div className="mb-1 text-xs font-medium text-foreground">{label}</div>
      {items.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-[11px] text-foreground">
          <span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto tabular-nums">{fmtHM(Number(p.value))}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-border pt-1 text-[11px] font-medium">
        <span>Total</span>
        <span className="tabular-nums">{fmtHM(total)}</span>
      </div>
    </div>
  );
}

export function AgencyHoursBreakdown({
  breakdown,
}: {
  breakdown: AgencyBreakdown;
}) {
  const kpis = [
    { label: "1o8 total", value: fmtHM(breakdown.totalHours) },
    { label: "Internal as % of all hours", value: fmtPct(breakdown.pctOfAll), accent: true },
    { label: breakdown.meetingsAdminLabel, value: fmtHM(breakdown.meetingsAdminHours) },
    { label: "Largest department", value: breakdown.largestLabel, text: true },
    { label: "Internal entries", value: breakdown.entryCount.toLocaleString() },
  ];

  return (
    <div className="space-y-3">
      <div className="text-sm font-bold text-foreground">1o8 Hours</div>
      <p className="text-xs text-muted-foreground">
        INTERNAL hours only — by department, then per person.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className={CARD}>
            <div className="text-[10px] font-bold uppercase text-muted-foreground">{k.label}</div>
            <div
              className={`mt-1 font-semibold ${
                k.text ? "text-sm leading-snug" : "text-2xl tabular-nums"
              } ${k.accent ? "text-brand" : "text-foreground"}`}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={CARD}>
          <div className="mb-2 text-sm font-medium">1o8 by department</div>
          {breakdown.activities.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No data</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(140, breakdown.activities.length * 28)}>
              <BarChart
                layout="vertical"
                data={breakdown.activities}
                margin={{ left: 8, right: 48, top: 4, bottom: 4 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [`${fmtHM(Number(v))}`, "Hours"]}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "var(--muted-foreground)" }}
                  itemStyle={{ color: "var(--foreground)" }}
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                />
                <Bar dataKey="hours" radius={[0, 4, 4, 0]}>
                  {breakdown.activities.map((a) => (
                    <Cell key={a.key} fill={a.color} />
                  ))}
                  <LabelList
                    dataKey="hours"
                    position="right"
                    formatter={(v) => `${fmtHM(Number(v))}`}
                    fill="var(--muted-foreground)"
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className={CARD}>
          <div className="mb-2 text-sm font-medium">Activity rollup</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-left text-[10px] font-bold uppercase text-muted-foreground dark:border-zinc-800">
                  <th className="pb-2 pr-2 font-bold">Department</th>
                  <th className="pb-2 pr-2 text-right font-bold">Hours</th>
                  <th className="pb-2 text-right font-bold">Share</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.activities.map((a) => (
                  <tr
                    key={a.key}
                    className="border-b border-stone-100 last:border-0 dark:border-zinc-800/60"
                  >
                    <td className="py-1.5 pr-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: a.color }}
                          aria-hidden
                        />
                        <span className="truncate">{a.label}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">
                      {fmtHM(a.hours)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {fmtPct(a.pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/50 font-medium">
                  <td className="py-1.5 pr-2 text-xs font-bold uppercase tracking-wide">Total</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{fmtHM(breakdown.totalHours)}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtPct(100)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      <div className={CARD}>
        <div className="mb-2 text-sm font-medium">Per person, by department</div>
        {breakdown.people.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">No data</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(260, 180 + breakdown.people.length * 4)}>
            <BarChart
              data={breakdown.people}
              margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                interval={0}
                angle={-40}
                textAnchor="end"
                height={70}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => fmtHM(Number(v))}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<StackTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.35 }} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="square"
                iconSize={8}
              />
              {breakdown.activities.map((a) => (
                <Bar
                  key={a.key}
                  dataKey={a.key}
                  name={a.label}
                  stackId="mf"
                  fill={a.color}
                  maxBarSize={36}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
