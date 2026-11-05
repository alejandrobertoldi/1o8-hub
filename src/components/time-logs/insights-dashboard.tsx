"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { TimeInsights } from "@/lib/time-logs/insights";

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

// ── Billing split, capacity, type of work ──────────────────────────
// (Totals, per-client / per-member bars and the person × client grid live in
// Hours Analytics' main tab; these are what it doesn't show.)

/** Client work vs internal vs PTO, and hours logged against 8 h per workday. */
export function BillingSplit({ data }: { data: TimeInsights }) {
  const { totals, billingTotals } = data;
  const client = billingTotals["Client work"] ?? 0;
  const internal = billingTotals["Internal (non-billable)"] ?? 0;
  const pto = billingTotals["PTO / Holiday"] ?? 0;
  const pct = (n: number) => (totals.hours ? `${Math.round((n / totals.hours) * 100)}%` : "—");
  return (
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
      <span className="rounded-full border px-3 py-1 text-muted-foreground">
        Run-rate <b className="text-foreground tabular-nums">{h1(totals.avgHoursPerActiveDay)} h</b> / active day
      </span>
    </div>
  );
}

export function WeeklyCapacity({ data }: { data: TimeInsights }) {
  const weekly = data.weekly.map((w) => ({ ...w, label: isoWeek(w.week) }));
  return (
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
  );
}

export function WorkTypes({ data }: { data: TimeInsights }) {
  const workTypes = Object.entries(data.byWorkType).sort((a, b) => b[1] - a[1]);
  const maxWork = Math.max(1, ...workTypes.map(([, v]) => v));
  return (
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

// ── Pieces ──────────────────────────────────────────────────────────

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
