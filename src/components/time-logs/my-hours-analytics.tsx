"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { DailyHoursHeatmap } from "@/components/admin/daily-hours-heatmap";
import { cn } from "@/lib/utils";
import type { TimeInsights } from "@/lib/time-logs/insights";
import { BillingSplit, Panel, WeeklyCapacity, WorkTypes, clientLabel } from "./insights-dashboard";
import { Card, Field, PERIODS, SELECT, Table, fmt, h2, iso, periodRange, type Period } from "./hours-insights-tab";

/** The team periods, plus one day picked on a calendar. */
const MY_PERIODS = ["Today", "Yesterday", "Pick a day", ...PERIODS.filter((p) => p !== "Today" && p !== "Yesterday")] as const;
type MyPeriod = Period | "Pick a day";

const tick = { fontSize: 11, fill: "var(--muted-foreground)" };
const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };

/**
 * "My hours" — the light Hours Analytics everyone gets: how *their own* time
 * was spent in a period (clients, type of work, projects, week by week against
 * 40 h) and how complete their logging is. Nobody else's hours.
 */
export function MyHoursAnalytics() {
  const now = new Date();
  const [period, setPeriod] = useState<MyPeriod>("This month");
  const [[from, to], setRange] = useState<[string, string]>(() => periodRange("This month", now)!);
  const choosePeriod = (p: MyPeriod) => {
    setPeriod(p);
    // "Pick a day" opens on today; the date field then moves it.
    const r = p === "Pick a day" ? ([iso(now), iso(now)] as [string, string]) : periodRange(p);
    if (r) setRange(r);
  };
  const qs = new URLSearchParams({ from, to, today: iso(now), mine: "1" }).toString();

  const { data, isLoading, isError, error } = useQuery<TimeInsights>({
    queryKey: ["my-hours-insights", qs],
    enabled: !!from && !!to && from <= to,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await fetch(`/api/time-logs/insights?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load your hours");
      return json;
    },
  });

  const clientNames = useMemo(() => new Map(Object.entries(data?.clientNames ?? {})), [data?.clientNames]);
  const me = data?.personStats[0];
  const compliance = data?.compliance[0];
  const byClient = (data?.clientStats ?? []).slice(0, 15).map((c) => ({ name: clientLabel(data!, c.client), hours: c.hours }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period">
          <select value={period} onChange={(e) => choosePeriod(e.target.value as MyPeriod)} className={SELECT}>
            {MY_PERIODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        {period === "Pick a day" ? (
          <Field label="Day">
            <Input type="date" value={from} onChange={(e) => e.target.value && setRange([e.target.value, e.target.value])} className="w-40" />
          </Field>
        ) : period === "Custom" ? (
          <>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} className="w-40" />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} className="w-40" />
            </Field>
          </>
        ) : (
          <span className="pb-2 text-xs font-medium">{from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`}</span>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading your hours…</p>}
      {isError && <p className="text-sm text-red-500">{(error as Error).message}</p>}
      {data && !data.totals.entries && <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">You have no hours logged in this period.</p>}

      {data && data.totals.entries > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Hours logged" value={h2(data.totals.hours)} hint={`${data.totals.entries} entries`} />
            <Tile
              label="Logged vs expected"
              value={data.totals.loggedPct != null ? `${data.totals.loggedPct}%` : "—"}
              hint={`${h2(data.totals.hours)} of ${h2(data.totals.expectedHours)} h (8 h / workday so far)`}
              tone={data.totals.loggedPct == null ? undefined : data.totals.loggedPct >= 95 ? "good" : data.totals.loggedPct >= 80 ? "warn" : "bad"}
            />
            <Tile label="Average per day" value={me ? h2(me.avgPerDay) : "—"} hint={me ? `${me.activeDays} days with hours` : undefined} />
            <Tile
              label="Workdays under 8 h"
              value={compliance ? String(compliance.workdaysUnderMinimum) : "—"}
              hint={compliance ? `of ${data.range.workdaysSoFar} workdays so far` : undefined}
              tone={compliance && compliance.workdaysUnderMinimum > 0 ? "bad" : undefined}
            />
          </div>

          <BillingSplit data={data} />
          <DailyHoursHeatmap from={from} to={to} categories={[]} clientNameMap={clientNames} mine />
          {from !== to && <WeeklyCapacity data={data} />}

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Hours by client" subtitle="Where your time went (1O8 = internal)">
              <ResponsiveContainer width="100%" height={Math.max(160, byClient.length * 26 + 30)}>
                <BarChart data={byClient} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={tick} />
                  <YAxis type="category" dataKey="name" width={150} tick={tick} interval={0} />
                  <Tooltip formatter={(v) => `${h2(Number(v))} h`} contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
                  <Bar dataKey="hours" name="Hours" fill="#F7BF1D" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <WorkTypes data={data} />
          </div>

          <Card title="Top projects">
            <Table
              head={["Project", "Client", "Name", "Hours"]}
              rows={data.topProjects.map((p) => [
                <span key="n" className="font-mono text-xs">{p.projectNumber}</span>,
                p.client,
                <span key="t" className="line-clamp-1 text-xs" title={p.projectName}>{p.projectName}</span>,
                h2(p.hours),
              ])}
              numeric={[3]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

const TONE = { good: "text-emerald-500", warn: "text-orange-500", bad: "text-red-500" } as const;

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: keyof typeof TONE }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-3xl font-bold tabular-nums", tone && TONE[tone])}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
