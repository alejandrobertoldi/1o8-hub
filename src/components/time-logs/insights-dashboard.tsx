"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Briefcase, Clock, Search, TrendingUp, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TimeInsights } from "@/lib/time-logs/insights";
import { TIMESHEET_LIMIT } from "@/lib/time-logs/catalog";

const h1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
const BILLING_COLORS: Record<string, string> = {
  "Client work": "#F7BF1D",
  "Internal (non-billable)": "#817F8A",
  "PTO / Holiday": "#2F8ADC",
};
const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const tick = { fontSize: 11, fill: "var(--muted-foreground)" };

/** ISO week number, for "W43 '26" labels like the time-tracking dashboard. */
function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `W${week} '${String(d.getUTCFullYear()).slice(2)}`;
}

export const clientLabel = (data: TimeInsights, code: string) => data.clientNames[code] ?? data.clientNames[code.toUpperCase()] ?? code;

// ── Overview & velocity ─────────────────────────────────────────────

export function OverviewPanel({ data }: { data: TimeInsights }) {
  const { totals, billingTotals } = data;
  const client = billingTotals["Client work"] ?? 0;
  const internal = billingTotals["Internal (non-billable)"] ?? 0;
  const pto = billingTotals["PTO / Holiday"] ?? 0;
  const pct = (n: number) => (totals.hours ? `${Math.round((n / totals.hours) * 100)}%` : "—");
  const weekly = data.weekly.map((w) => ({ ...w, label: isoWeek(w.week) }));
  const byClient = data.clientStats.slice(0, 15).map((c) => ({ name: clientLabel(data, c.client), hours: c.hours }));
  const byPerson = Object.entries(data.byPersonBilling)
    .map(([name, m]) => ({ name, ...m, total: Object.values(m).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  const workTypes = Object.entries(data.byWorkType).sort((a, b) => b[1] - a[1]);
  const maxWork = Math.max(1, ...workTypes.map(([, v]) => v));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Clock} label="Total hours tracked" value={h1(totals.hours)} unit="hrs" hint={<>Across <b>{totals.entries}</b> entries</>} />
        <Kpi
          icon={Briefcase}
          label="Active clients"
          value={String(totals.activeClients)}
          unit="accounts"
          hint={totals.topClient ? <>Top: <b>{clientLabel(data, totals.topClient.code)}</b> ({h1(totals.topClient.hours)} h)</> : "No client hours"}
        />
        <Kpi icon={Users} label="Active team members" value={String(totals.peopleLogging)} unit={`of ${totals.peopleInScope}`} hint="logged at least once" />
        <Kpi
          icon={TrendingUp}
          label="Average hours / member"
          value={h1(totals.avgHoursPerMember)}
          unit="hrs / active member"
          hint={<>Run-rate: <b>{h1(totals.avgHoursPerActiveDay)} h</b> / active day</>}
        />
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Chip color={BILLING_COLORS["Client work"]} label="Client work" value={`${h1(client)} h · ${pct(client)}`} />
        <Chip color={BILLING_COLORS["Internal (non-billable)"]} label="Internal" value={`${h1(internal)} h · ${pct(internal)}`} />
        <Chip color={BILLING_COLORS["PTO / Holiday"]} label="PTO / holiday" value={`${h1(pto)} h · ${pct(pto)}`} />
        {totals.loggedPct != null && (
          <span className="rounded-full border px-3 py-1">
            Logged vs expected{" "}
            <b className={totals.loggedPct >= 95 ? "text-emerald-500" : totals.loggedPct >= 80 ? "text-orange-500" : "text-red-500"}>{totals.loggedPct}%</b>{" "}
            <span className="text-muted-foreground">({h1(totals.hours)} of {h1(totals.expectedHours)} h at 8 h/workday)</span>
          </span>
        )}
      </div>

      <Panel
        title="Weekly hours vs capacity"
        subtitle={`Hours logged per week against the ${data.capacityPerWeek} h capacity goal (40 h × ${data.capacityPerWeek / 40} ${data.capacityPerWeek === 40 ? "person" : "people"}; partial weeks prorated)`}
      >
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={weekly} margin={{ left: -10, right: 8, top: 5, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={tick} />
            <YAxis tick={tick} unit="h" />
            <Tooltip formatter={(v) => `${h1(Number(v))} h`} contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {data.billingTypes.map((b) => (
              <Bar key={b} dataKey={b} stackId="w" fill={BILLING_COLORS[b] ?? "#A9A7B5"} />
            ))}
            <Line type="linear" dataKey="capacity" name="Capacity goal" stroke="#E5484D" strokeDasharray="6 4" strokeWidth={2} dot={{ r: 3, fill: "#E5484D" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Hours by client" subtitle="Top 15 in the period">
          <ResponsiveContainer width="100%" height={Math.max(160, byClient.length * 26 + 30)}>
            <BarChart data={byClient} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={tick} />
              <YAxis type="category" dataKey="name" width={150} tick={tick} interval={0} />
              <Tooltip formatter={(v) => `${h1(Number(v))} h`} contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
              <Bar dataKey="hours" name="Hours" fill="#F7BF1D" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Hours by person" subtitle="Client work vs internal vs PTO">
          <ResponsiveContainer width="100%" height={Math.max(160, byPerson.length * 26 + 50)}>
            <BarChart data={byPerson} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={tick} />
              <YAxis type="category" dataKey="name" width={130} tick={tick} interval={0} />
              <Tooltip formatter={(v) => `${h1(Number(v))} h`} contentStyle={tooltipStyle} cursor={{ fill: "var(--muted)" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.billingTypes.map((b) => (
                <Bar key={b} dataKey={b} stackId="b" fill={BILLING_COLORS[b] ?? "#A9A7B5"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Type of work">
        <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {workTypes.map(([w, v]) => (
            <li key={w} className="text-xs">
              <div className="flex justify-between">
                <span>{w}</span>
                <span className="tabular-nums text-muted-foreground">{h1(v)} h</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(v / maxWork) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

// ── Client distribution ─────────────────────────────────────────────

export function ClientDistribution({ data }: { data: TimeInsights }) {
  return (
    <Panel title="Client portfolio" subtitle={`Hours per client in the period · ${data.totals.activeClients} active client accounts`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.clientStats.map((c) => (
          <Link key={c.client} href={`/clients/${encodeURIComponent(c.client)}`} className="rounded-lg border p-3 transition-colors hover:border-brand">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{clientLabel(data, c.client)}</span>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{c.entries} entries</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold tabular-nums">
                {h1(c.hours)} <span className="text-xs font-normal text-muted-foreground">hours</span>
              </span>
              <span className="rounded-full border px-2 py-0.5 text-[11px] tabular-nums">{c.share.toFixed(1)}% share</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, c.share)}%` }} />
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 text-xs text-muted-foreground">
              <span>Team assigned</span>
              <span className="text-foreground">
                {c.people} member{c.people === 1 ? "" : "s"}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Panel>
  );
}

// ── Team performance ────────────────────────────────────────────────

export function TeamPerformance({ data, onPick }: { data: TimeInsights; onPick: (userId: string) => void }) {
  const expected = new Map(data.compliance.map((c) => [c.userId, c]));
  return (
    <Panel title="Team performance" subtitle="Per person in the period. Click a name to scope the dashboard to them.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1.5">Person</th>
              <th className="px-2 py-1.5 text-right">Hours</th>
              <th className="px-2 py-1.5 text-right">Entries</th>
              <th className="px-2 py-1.5 text-right">Active days</th>
              <th className="px-2 py-1.5 text-right">Avg / day</th>
              <th className="px-2 py-1.5 text-right">Clients</th>
              <th className="px-2 py-1.5 text-right">Client work</th>
              <th className="px-2 py-1.5">Logged vs expected</th>
            </tr>
          </thead>
          <tbody>
            {data.personStats.map((p) => {
              const c = expected.get(p.userId);
              const pct = c?.expectedHours ? Math.round((c.hoursLogged / c.expectedHours) * 100) : null;
              return (
                <tr key={p.userId} className="border-t border-border/40">
                  <td className="px-2 py-1.5">
                    <button type="button" className="font-medium hover:text-brand hover:underline" onClick={() => onPick(p.userId)}>
                      {p.name}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{h1(p.hours)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.entries}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.activeDays}</td>
                  <td className={cn("px-2 py-1.5 text-right tabular-nums", p.avgPerDay < 8 && "text-orange-500")}>{h1(p.avgPerDay)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.clients}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.clientSharePct}%</td>
                  <td className="px-2 py-1.5">
                    {pct == null ? (
                      "—"
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-muted">
                          <div className={cn("h-1.5 rounded-full", pct >= 95 ? "bg-emerald-500" : pct >= 80 ? "bg-orange-500" : "bg-red-500")} style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{pct}%</span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** The "Summary" tab of the time-tracking sheet: hours per person per client, with totals. */
export function PersonClientMatrix({ data }: { data: TimeInsights }) {
  const rows = Object.entries(data.byPersonClient).sort(([a], [b]) => a.localeCompare(b));
  const colTotals: Record<string, number> = {};
  for (const [, m] of rows) for (const [c, v] of Object.entries(m)) colTotals[c] = (colTotals[c] ?? 0) + v;
  const cols = Object.keys(colTotals).sort((a, b) => colTotals[b] - colTotals[a]);
  const max = Math.max(1, ...rows.flatMap(([, m]) => Object.values(m)));
  const shade = (v: number) => `color-mix(in oklab, #F7BF1D ${Math.round(12 + (v / max) * 60)}%, transparent)`;

  return (
    <Panel title="Person × client" subtitle="Like the Summary tab of the time-tracking sheet, for the selected period">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-2 py-1.5">Person</th>
              {cols.map((c) => (
                <th key={c} className="whitespace-nowrap px-2 py-1.5 text-right" title={clientLabel(data, c)}>
                  {c}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([who, m]) => (
              <tr key={who} className="border-t border-border/40">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1 font-medium">{who}</td>
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1 text-right tabular-nums" style={m[c] ? { background: shade(m[c]) } : undefined}>
                    {m[c] ? h1(m[c]) : ""}
                  </td>
                ))}
                <td className="px-2 py-1 text-right font-semibold tabular-nums">{h1(Object.values(m).reduce((a, b) => a + b, 0))}</td>
              </tr>
            ))}
            <tr className="border-t-2 font-semibold">
              <td className="sticky left-0 z-10 bg-card px-2 py-1">Total</td>
              {cols.map((c) => (
                <td key={c} className="px-2 py-1 text-right tabular-nums">
                  {h1(colTotals[c])}
                </td>
              ))}
              <td className="px-2 py-1 text-right tabular-nums">{h1(Object.values(colTotals).reduce((a, b) => a + b, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Consolidated timesheet ──────────────────────────────────────────

export function Timesheet({ data }: { data: TimeInsights }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data.entries;
    return data.entries.filter((e) =>
      [e.person, e.client, clientLabel(data, e.client), e.workType, e.projectNumber, e.projectName, e.note ?? ""].some((v) => v.toLowerCase().includes(needle)),
    );
  }, [q, data]);
  const total = rows.reduce((a, e) => a + e.hours, 0);

  return (
    <Panel title="Consolidated timesheet" subtitle={`Every entry in scope, newest first${data.totals.entries > TIMESHEET_LIMIT ? ` (latest ${TIMESHEET_LIMIT} of ${data.totals.entries})` : ""}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, clients, projects, notes…" className="pl-8" />
        </div>
        <span className="text-xs text-muted-foreground">
          {rows.length} entries · {h1(total)} h
        </span>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-1.5">Date</th>
              <th className="px-2 py-1.5">Person</th>
              <th className="px-2 py-1.5">Client</th>
              <th className="px-2 py-1.5">Project</th>
              <th className="px-2 py-1.5">Type of work</th>
              <th className="px-2 py-1.5 text-right">Hours</th>
              <th className="px-2 py-1.5">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} className="border-t border-border/40 align-top">
                <td className="whitespace-nowrap px-2 py-1 tabular-nums">{e.date}</td>
                <td className="whitespace-nowrap px-2 py-1">{e.person}</td>
                <td className="whitespace-nowrap px-2 py-1">{clientLabel(data, e.client)}</td>
                <td className="px-2 py-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{e.projectNumber}</span> {e.projectName}
                </td>
                <td className="whitespace-nowrap px-2 py-1">{e.workType}</td>
                <td className="px-2 py-1 text-right tabular-nums">{h1(e.hours)}</td>
                <td className="px-2 py-1 text-muted-foreground">{e.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, value, unit, hint }: { icon: typeof Clock; label: string; value: string; unit?: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground [&_b]:text-foreground">{hint}</div>}
    </div>
  );
}

function Chip({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label} <b className="tabular-nums">{value}</b>
    </span>
  );
}

export function Panel({ title, subtitle, className, children }: { title: string; subtitle?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
