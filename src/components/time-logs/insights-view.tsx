"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TimeInsights } from "@/lib/time-logs/insights";
import { WORK_TYPES } from "@/lib/time-logs/catalog";
import { READINESS_DEPARTMENTS } from "@/lib/readiness/match";
import { ClientDistribution, OverviewPanel, PersonClientMatrix, TeamPerformance, Timesheet, clientLabel } from "./insights-dashboard";
import { BarChart3, Briefcase, FileText, UserCheck, X } from "lucide-react";

const TABS = [
  { key: "overview", label: "Overview & velocity", icon: BarChart3 },
  { key: "clients", label: "Clients", icon: Briefcase },
  { key: "team", label: "Team", icon: UserCheck },
  { key: "timesheet", label: "Timesheet", icon: FileText },
] as const;
type Tab = (typeof TABS)[number]["key"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const h2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** Period shortcuts; weeks run Monday–Sunday. */
const PERIODS = ["This month", "Last month", "This week", "Last week", "This quarter", "Year to date", "Custom"] as const;
type Period = (typeof PERIODS)[number];
function periodRange(p: Period, now = new Date()): [string, string] | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
  const plus = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
  switch (p) {
    case "This month":
      return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case "Last month":
      return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "This week":
      return [iso(monday), iso(plus(monday, 6))];
    case "Last week":
      return [iso(plus(monday, -7)), iso(plus(monday, -1))];
    case "This quarter": {
      const q = Math.floor(m / 3) * 3;
      return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))];
    }
    case "Year to date":
      return [iso(new Date(y, 0, 1)), iso(now)];
    default:
      return null;
  }
}

/** Hours insights for any period (admins): a visual dashboard on top, the TIME TRACKING 2.0 "Insights" tables below. Opens on the current month. */
export function TimeInsightsView() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("This month");
  const [[from, to], setRange] = useState<[string, string]>(() => periodRange("This month", now)!);
  const setFrom = (v: string) => setRange([v, to]);
  const setTo = (v: string) => setRange([from, v]);
  const [team, setTeam] = useState("");
  const [user, setUser] = useState("");
  const [workType, setWorkType] = useState("");
  const [client, setClient] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const resetScope = () => {
    setTeam("");
    setUser("");
    setWorkType("");
    setClient("");
  };
  const today = iso(now);
  const choosePeriod = (p: Period) => {
    setPeriod(p);
    const r = periodRange(p);
    if (r) setRange(r);
  };
  const filterQs = new URLSearchParams({ from, to, today, ...(team && { team }), ...(user && { user }), ...(workType && { workType }), ...(client && { client }) }).toString();

  const { data, isLoading, isError, error } = useQuery<TimeInsights>({
    queryKey: ["time-insights", filterQs],
    enabled: !!from && !!to && from <= to,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const res = await fetch(`/api/time-logs/insights?${filterQs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load insights");
      return json;
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Period">
          <select value={period} onChange={(e) => choosePeriod(e.target.value as Period)} className={SELECT}>
            {PERIODS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        {period === "Custom" ? (
          <>
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </Field>
          </>
        ) : (
          <span className="pb-2 text-xs font-medium">
            {fmt(from)} – {fmt(to)}
          </span>
        )}
        <Field label="Team">
          <select value={team} onChange={(e) => { setTeam(e.target.value); setUser(""); }} className={SELECT}>
            <option value="">All teams</option>
            {READINESS_DEPARTMENTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Person">
          <select value={user} onChange={(e) => setUser(e.target.value)} className={cn(SELECT, "max-w-48")}>
            <option value="">Everyone</option>
            {(data?.people ?? [])
              .filter((p) => !team || p.team === team)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Client">
          <select value={client} onChange={(e) => setClient(e.target.value)} className={cn(SELECT, "max-w-48")}>
            <option value="">All clients</option>
            {Object.entries(data?.clientNames ?? {})
              .sort((a, b) => a[1].localeCompare(b[1]))
              .map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Type of work">
          <select value={workType} onChange={(e) => setWorkType(e.target.value)} className={cn(SELECT, "max-w-44")}>
            <option value="">All types</option>
            {WORK_TYPES.map((w) => (
              <option key={w.label}>{w.label}</option>
            ))}
          </select>
        </Field>
        {(team || user || workType || client) && (
          <button type="button" onClick={resetScope} className="mb-1 inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-500/20">
            <X className="size-3.5" /> Reset scope
          </button>
        )}
      </div>

      {data && (team || user || workType || client) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-2.5 text-sm">
          <UserCheck className="size-4 text-brand" />
          <span>
            Scoped to{" "}
            <b>
              {[
                user ? data.people.find((p) => p.id === user)?.name : team ? `${team} team` : null,
                client ? clientLabel(data, client) : null,
                workType || null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </b>{" "}
            · {h2(data.totals.hours)} h across {data.totals.entries} entries
          </span>
          <button type="button" onClick={resetScope} className="ml-auto rounded-md bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground">
            Switch to everyone
          </button>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Hours insights views">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
              tab === t.key ? "border-brand font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" />
            {t.label}
            {data && t.key === "clients" && <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{data.totals.activeClients}</span>}
            {data && t.key === "team" && <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{data.totals.peopleLogging}</span>}
            {data && t.key === "timesheet" && <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{data.totals.entries}</span>}
          </button>
        ))}
        {data && (
          <span className="ml-auto hidden shrink-0 self-center text-xs text-muted-foreground md:inline">
            {data.range.workdays} workdays · {data.range.workdaysSoFar} so far
          </span>
        )}
      </nav>

      {isLoading && <p className="text-sm text-muted-foreground">Loading insights…</p>}
      {isError && <p className="text-sm text-red-500">{(error as Error).message}</p>}

      {data && !data.totals.entries && (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">No hours logged in this period for this scope.</p>
      )}

      {data && data.totals.entries > 0 && tab === "overview" && <OverviewPanel data={data} />}

      {data && data.totals.entries > 0 && tab === "clients" && (
        <>
          <ClientDistribution data={data} />
          {team || user || workType ? (
            <p className="text-xs text-muted-foreground">Client hours vs estimate is shown for the whole team only (clear the team, person and type of work filters).</p>
          ) : (
          <Card title="Client hours vs estimate" subtitle="Estimate = the client's monthly Estimated Hours (AAC table), prorated to the range. Hours over the estimate are work the client isn't paying for.">
            <Table
              head={["Client", "Hours", "Monthly estimate", "Estimate (range)", "Used", "Over estimate"]}
              rows={data.clientVsEstimate.map((c) => [
                <Link key="c" href={`/clients/${encodeURIComponent(c.client)}`} className="hover:underline">
                  <span className="font-mono text-xs">{c.client}</span> <span className="text-xs text-muted-foreground">{c.clientName}</span>
                </Link>,
                h2(c.hours),
                c.monthlyEstimate ?? "—",
                c.estimate != null ? h2(c.estimate) : "—",
                c.usedPct != null ? <UsedBar key="u" pct={c.usedPct} /> : "—",
                c.overEstimate ? <span key="o" className="font-semibold text-red-500">{h2(c.overEstimate)}</span> : "—",
              ])}
              numeric={[1, 2, 3, 5]}
            />
          </Card>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
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
            <Card title="Hours by client and type of work">
              <Breakdown data={data.byClientDepartment} />
            </Card>
          </div>
        </>
      )}

      {data && data.totals.entries > 0 && tab === "timesheet" && <Timesheet data={data} />}

      {data && data.totals.entries > 0 && tab === "team" && (
        <>
          <TeamPerformance data={data} onPick={(id) => { setUser(id); setTab("overview"); }} />
          <PersonClientMatrix data={data} />
          <Card title="Logging compliance" subtitle={`Minimum 8 hours per workday. Expected hours count workdays up to today.`}>
            <Table
              head={["Employee", "Hours logged", "Expected", "Gap", "Workdays logged", "Workdays under minimum"]}
              rows={data.compliance.map((c) => [
                c.name,
                h2(c.hoursLogged),
                h2(c.expectedHours),
                <span key="g" className={cn(c.gap > 0 && "font-semibold text-red-500")}>{h2(c.gap)}</span>,
                c.workdaysLogged,
                <span key="u" className={cn(c.workdaysUnderMinimum > 0 && "font-semibold text-red-500")}>{c.workdaysUnderMinimum}</span>,
              ])}
              numeric={[1, 2, 3, 4, 5]}
            />
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Client vs internal vs PTO">
              <div className="mb-3 flex flex-wrap gap-2">
                {data.billingTypes.map((b) => (
                  <span key={b} className="rounded-lg bg-muted px-3 py-1.5 text-xs">
                    {b} <span className="ml-1 font-bold tabular-nums">{h2(data.billingTotals[b] ?? 0)}</span>
                  </span>
                ))}
              </div>
              <Table
                head={["Employee", ...data.billingTypes]}
                rows={Object.entries(data.byPersonBilling)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([who, m]) => [who, ...data.billingTypes.map((b) => (m[b] ? h2(m[b]) : "—"))])}
                numeric={data.billingTypes.map((_, i) => i + 1)}
              />
            </Card>
            <Card title="Hours by person and type of work">
              <Breakdown data={data.byPersonDepartment} />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const SELECT = "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";
const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function UsedBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted">
        <div className={cn("h-1.5 rounded-full", pct > 100 ? "bg-red-500" : "bg-brand")} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={cn("text-xs tabular-nums", pct > 100 && "font-semibold text-red-500")}>{pct}%</span>
    </div>
  );
}

function Breakdown({ data }: { data: Record<string, Record<string, number>> }) {
  const rows = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
  const cols = [...new Set(rows.flatMap(([, m]) => Object.keys(m)))].sort();
  if (!rows.length) return <p className="text-sm text-muted-foreground">No hours in this range.</p>;
  return (
    <Table
      head={["", ...cols, "Total"]}
      rows={rows.map(([k, m]) => [k, ...cols.map((c) => (m[c] ? h2(m[c]) : "")), h2(Object.values(m).reduce((a, b) => a + b, 0))])}
      numeric={[...cols.map((_, i) => i + 1), cols.length + 1]}
    />
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="text-sm font-bold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      <div className="overflow-x-auto p-4">{children}</div>
    </section>
  );
}

function Table({ head, rows, numeric = [] }: { head: React.ReactNode[]; rows: React.ReactNode[][]; numeric?: number[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data in this range.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {head.map((h, i) => (
            <th key={i} className={cn("px-2 py-1.5 whitespace-nowrap", numeric.includes(i) && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border/40">
            {r.map((c, j) => (
              <td key={j} className={cn("px-2 py-1.5", numeric.includes(j) && "text-right tabular-nums")}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
