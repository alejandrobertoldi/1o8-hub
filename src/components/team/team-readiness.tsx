"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, RefreshCw, Save, Settings2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReadinessBoard, ReadinessRow } from "@/lib/readiness/server";
import { DUE_TODAY_TEXT, readinessBar, readinessText } from "@/lib/readiness/tone";

type BoardResponse = { live: ReadinessBoard; compare: ReadinessBoard | null; compareDate: string | null; snapshotDates: string[] };
type HistoryRow = { date: string; scope: string; key: string; open: number; dueToday: number; overdue: number; readiness: number };

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const tone = readinessBar;
const toneText = readinessText;
const PERSON_SERIES = "Selected person";
const LINE_COLORS = ["#F7BF1D", "#2F8ADC", "#34C759", "#C73737", "#8663E6", "#B94F87", "#A9A7B5"];

/**
 * Live Readiness board (the 1o8 Agency Dashboard "Readiness" tab): open,
 * due-today and overdue Asana tasks by department and person. Readiness =
 * 1 − overdue / open. A snapshot is saved every morning; pick a saved day to
 * compare against, and the trend shows readiness over time.
 */
export function TeamReadiness({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [compare, setCompare] = useState("yesterday");
  const [dept, setDept] = useState("all");
  const [who, setWho] = useState<"all" | "team" | "providers">("all");
  // Focus the whole board (KPIs, table, trend) on one person, by their assignee key.
  const [person, setPerson] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [showMap, setShowMap] = useState(false);

  const { data, isLoading, isError } = useQuery<BoardResponse>({
    queryKey: ["readiness", compare],
    queryFn: async () => {
      const res = await fetch(`/api/readiness?compare=${encodeURIComponent(compare)}`);
      if (!res.ok) throw new Error("Could not load readiness");
      return res.json();
    },
    refetchInterval: 5 * 60_000,
  });
  const { data: history = [] } = useQuery<HistoryRow[]>({
    queryKey: ["readiness-history", days, person],
    queryFn: async () => (await fetch(`/api/readiness/history?days=${days}${person ? `&person=${encodeURIComponent(person)}` : ""}`)).json(),
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["readiness"] });
    qc.invalidateQueries({ queryKey: ["readiness-history"] });
    qc.invalidateQueries({ queryKey: ["readiness-assignees"] });
  };
  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/readiness/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      return json as { open: number };
    },
    onSuccess: (r) => {
      toast.success(`Asana synced: ${r.open} open tasks`);
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const snapshot = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/readiness/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!res.ok) throw new Error("Could not save the snapshot");
      return res.json() as Promise<{ date: string }>;
    },
    onSuccess: (r) => {
      toast.success(`Snapshot saved for ${fmtDate(r.date)}`);
      refreshAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const trend = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const h of history) {
      const row = byDate.get(h.date) ?? { date: h.date };
      row[h.scope === "total" ? "All team" : h.scope === "person" ? PERSON_SERIES : h.key] = h.readiness;
      byDate.set(h.date, row);
    }
    return [...byDate.values()];
  }, [history]);
  const series = useMemo(() => [...new Set(history.filter((h) => h.scope === "department").map((h) => h.key))].sort(), [history]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading readiness…</p>;
  if (isError || !data) return <p className="text-sm text-muted-foreground">Readiness could not be loaded.</p>;

  const { live, compare: prev, compareDate } = data;
  const prevDept = new Map(prev?.departments.map((d) => [d.key, d]) ?? []);
  const prevPerson = new Map(prev?.people.map((p) => [p.key, p]) ?? []);
  const people = live.people.filter(
    (p) =>
      (person ? p.key === person : dept === "all" || (p.department ?? "none") === dept) &&
      (who === "all" || (who === "providers" ? !!p.providerId : !p.providerId)),
  );
  // KPIs follow the focus: one person, one team (department), or everyone.
  const pick = (b: ReadinessBoard | null) =>
    !b ? null : person ? b.people.find((p) => p.key === person) ?? null : dept !== "all" ? b.departments.find((d) => (d.department ?? "none") === dept) ?? null : b.total;
  const focus = pick(live) ?? { ...live.total, open: 0, dueToday: 0, overdue: 0, readiness: 100 };
  const focusPrev = pick(prev);
  const focusLabel = person ? live.people.find((p) => p.key === person)?.label ?? "Person" : dept !== "all" ? (dept === "none" ? "No department" : `${dept} team`) : null;
  const onFocusChange = (v: string) => {
    if (v.startsWith("p:")) {
      setPerson(v.slice(2));
      setDept("all");
    } else {
      setPerson(null);
      setDept(v.startsWith("d:") ? v.slice(2) : "all");
    }
  };
  const focusValue = person ? `p:${person}` : dept !== "all" ? `d:${dept}` : "all";
  const visibleSeries = person ? [] : dept !== "all" ? series.filter((s) => s === dept) : series;
  const providerCount = live.people.filter((p) => p.providerId).length;
  const select = "h-8 rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30";

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-500">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
        </span>
        <span className="text-xs text-muted-foreground">
          {fmtDate(live.date)} (Chicago) · Asana synced {live.lastSyncAt ? new Date(live.lastSyncAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "never"}
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          View
          <select aria-label="Person or team" value={focusValue} onChange={(e) => onFocusChange(e.target.value)} className={cn(select, "max-w-52")}>
            <option value="all">Everyone</option>
            <optgroup label="Teams">
              {live.departments.map((d) => (
                <option key={d.key} value={`d:${d.department ?? "none"}`}>
                  {d.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="People">
              {[...live.people]
                .filter((p) => p.key !== "unassigned")
                .sort((a, b) => a.label.localeCompare(b.label))
                .map((p) => (
                  <option key={p.key} value={`p:${p.key}`}>
                    {p.label}
                    {p.providerId ? " (provider)" : ""}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Compare with
          <select aria-label="Compare with" value={compare} onChange={(e) => setCompare(e.target.value)} className={select}>
            <option value="yesterday">Yesterday</option>
            <option value="7d">7 days ago</option>
            <option value="30d">30 days ago</option>
            {data.snapshotDates.map((d) => (
              <option key={d} value={d}>
                {fmtDate(d)}
              </option>
            ))}
          </select>
        </label>
        {isAdmin && (
          <>
            <Button variant="outline" size="sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} /> Sync Asana
            </Button>
            <Button variant="outline" size="sm" disabled={snapshot.isPending} onClick={() => snapshot.mutate()} title="Replace today's snapshot with the current numbers">
              <Save className="size-3.5" /> Save snapshot
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {compareDate
          ? `Δ = change vs the snapshot of ${fmtDate(compareDate)}${compareDate === live.date ? " (today's morning snapshot)" : ""}.`
          : "No saved snapshot to compare with yet. Snapshots are saved every morning."}
      </p>

      {/* KPIs */}
      {focusLabel && (
        <div className="flex items-center gap-2 text-sm">
          <span className="font-bold">{focusLabel}</span>
          <button className="text-xs text-brand hover:underline" onClick={() => onFocusChange("all")}>
            Show everyone
          </button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open tasks" value={focus.open} delta={focusPrev ? focus.open - focusPrev.open : null} />
        <Kpi
          label="Due today"
          value={focus.dueToday}
          valueClass={focus.dueToday ? DUE_TODAY_TEXT : undefined}
          delta={focusPrev ? focus.dueToday - focusPrev.dueToday : null}
          badWhenUp
        />
        <Kpi label="Overdue" value={focus.overdue} delta={focusPrev ? focus.overdue - focusPrev.overdue : null} badWhenUp danger={focus.overdue > 0} />
        <Kpi
          label="Readiness"
          value={`${focus.readiness.toFixed(2)}%`}
          valueClass={toneText(focus.readiness)}
          delta={focusPrev ? Math.round((focus.readiness - focusPrev.readiness) * 100) / 100 : null}
          unit=" pts"
          hint="1 − overdue / open"
        />
      </div>

      {/* Departments */}
      <section className="rounded-xl border bg-card">
        <header className="border-b px-4 py-3">
          <h2 className="text-sm font-bold">By department</h2>
        </header>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {live.departments.map((d) => {
            const p = prevDept.get(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onFocusChange(dept === (d.department ?? "none") && !person ? "all" : `d:${d.department ?? "none"}`)}
                className={cn("rounded-lg border p-3 text-left transition-colors hover:border-brand", !person && dept === (d.department ?? "none") && "border-brand")}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d.label}</div>
                <div className={cn("mt-1 text-2xl font-bold tabular-nums", toneText(d.readiness))}>{d.readiness.toFixed(1)}%</div>
                <Bar pct={d.readiness} />
                <div className="mt-2 grid grid-cols-3 text-[11px] tabular-nums text-muted-foreground">
                  <span>
                    <b className="text-foreground">{d.open}</b> open
                  </span>
                  <span>
                    <b className={cn(d.dueToday ? DUE_TODAY_TEXT : "text-foreground")}>{d.dueToday}</b> today
                  </span>
                  <span>
                    <b className={cn(d.overdue ? "text-red-500" : "text-foreground")}>{d.overdue}</b> late
                  </span>
                </div>
                {p && <Delta className="mt-1" value={Math.round((d.readiness - p.readiness) * 10) / 10} unit=" pts" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* People */}
      <section className="overflow-x-auto rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-bold">By team member{dept !== "all" && <span className="ml-1 font-normal text-muted-foreground">· {dept === "none" ? "No department" : dept}</span>}</h2>
          <div className="flex items-center gap-3">
            {(dept !== "all" || person) && (
              <button className="text-xs text-brand hover:underline" onClick={() => onFocusChange("all")}>
                Show everyone
              </button>
            )}
            {providerCount > 0 && (
              <div className="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Team or service providers">
                {(["all", "team", "providers"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setWho(w)}
                    className={cn("rounded px-2 py-0.5 capitalize", who === w ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:text-foreground")}
                  >
                    {w === "providers" ? `Providers (${providerCount})` : w}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2">Person</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2 text-right">Open</th>
              <th className="px-3 py-2 text-right">Due today</th>
              <th className="px-3 py-2 text-right">Overdue</th>
              <th className="px-3 py-2">Readiness</th>
              <th className="px-3 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const before = prevPerson.get(p.key);
              return (
                <tr key={p.key} className="border-t border-border/40">
                  <td className="px-4 py-2 font-medium">
                    <button type="button" className="mr-1.5 align-middle text-muted-foreground hover:text-brand" title="Focus the board on this person" aria-label={`Focus on ${p.label}`} onClick={() => onFocusChange(person === p.key ? "all" : `p:${p.key}`)}>
                      <Crosshair className="size-3" />
                    </button>
                    {p.userId ? (
                      <Link href={`/team/${p.userId}`} className="hover:underline">
                        {p.label}
                      </Link>
                    ) : (
                      <span className={cn(p.key === "unassigned" && "italic text-muted-foreground")}>{p.label}</span>
                    )}
                    {p.providerId && (
                      <span className="ml-2 rounded-full border border-brand/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-brand" title="Contracted service provider, not an employee">
                        Provider
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.department ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.open}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", p.dueToday && `font-semibold ${DUE_TODAY_TEXT}`)}>{p.dueToday || "—"}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", p.overdue && "font-semibold text-red-500")}>{p.overdue || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Bar pct={p.readiness} />
                      </div>
                      <span className={cn("text-xs font-semibold tabular-nums", toneText(p.readiness))}>{p.readiness.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">{before ? <Delta value={Math.round((p.readiness - before.readiness) * 10) / 10} unit=" pts" /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Trend */}
      <section className="rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-bold">Readiness over time</h2>
          <select aria-label="Trend range" value={days} onChange={(e) => setDays(Number(e.target.value))} className={select}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        </header>
        <div className="h-72 p-4">
          {trend.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              The trend builds up from the daily morning snapshots ({trend.length} saved so far). Come back after a few days.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 5, right: 16, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d).replace(/, \d{4}$/, "")} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  formatter={(v) => `${Number(v).toFixed(1)}%`}
                  labelFormatter={(d) => fmtDate(String(d))}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="All team" stroke="#F7BF1D" strokeWidth={3} dot={false} />
                {person && <Line type="monotone" dataKey={PERSON_SERIES} stroke="#2F8ADC" strokeWidth={2.5} dot={false} />}
                {visibleSeries.map((s, i) => (
                  <Line key={s} type="monotone" dataKey={s} stroke={LINE_COLORS[(i + 1) % LINE_COLORS.length]} strokeWidth={1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {isAdmin && (
        <section className="rounded-xl border bg-card">
          <button type="button" onClick={() => setShowMap((s) => !s)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            <Settings2 className="size-4 text-muted-foreground" />
            <span className="text-sm font-bold">Asana assignee mapping</span>
            <span className="text-xs text-muted-foreground">Who each Asana name is (team member or service provider), their department, and who doesn't count (client contacts)</span>
          </button>
          {showMap && <AssigneeMapEditor onChanged={refreshAll} />}
        </section>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  unit = "",
  badWhenUp,
  danger,
  valueClass,
  hint,
}: {
  label: string;
  value: number | string;
  delta: number | null;
  unit?: string;
  badWhenUp?: boolean;
  danger?: boolean;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground" title={hint}>
        {label}
      </div>
      <div className={cn("mt-1 text-3xl font-bold tabular-nums", danger && "text-red-500", valueClass)}>{value}</div>
      {delta !== null && <Delta value={delta} unit={unit} badWhenUp={badWhenUp} className="mt-1" />}
    </div>
  );
}

/** Up-is-good by default (readiness); `badWhenUp` flips it (overdue). Counts of open/due are neutral. */
function Delta({ value, unit = "", badWhenUp, className }: { value: number; unit?: string; badWhenUp?: boolean; className?: string }) {
  const neutral = unit === "" && !badWhenUp;
  const good = badWhenUp ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        "text-xs font-semibold tabular-nums",
        value === 0 || neutral ? "text-muted-foreground" : good ? "text-emerald-500" : "text-red-500",
        className,
      )}
    >
      {value > 0 ? "▲" : value < 0 ? "▼" : "="} {Math.abs(value)}
      {unit}
    </span>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="mt-1 h-1.5 rounded-full bg-muted">
      <div className={cn("h-1.5 rounded-full", tone(pct))} style={{ width: `${Math.max(2, Math.min(pct, 100))}%` }} />
    </div>
  );
}

type MapRow = {
  assigneeKey: string;
  assigneeName: string | null;
  userId: string | null;
  userName: string | null;
  providerId: string | null;
  providerName: string | null;
  department: string | null;
  excluded: boolean;
  open: number;
};

function AssigneeMapEditor({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ departments: string[]; assignees: MapRow[]; providers: { id: string; name: string; status: string }[] }>({
    queryKey: ["readiness-assignees"],
    queryFn: async () => (await fetch("/api/readiness/assignees")).json(),
  });
  const { data: people = [] } = useQuery<{ id: string; name: string | null }[]>({
    queryKey: ["team-directory-table"],
    queryFn: async () => (await fetch("/api/team/directory")).json(),
  });
  const save = useMutation({
    mutationFn: async (body: Partial<MapRow> & { assigneeKey: string }) => {
      const res = await fetch("/api/readiness/assignees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not save");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["readiness-assignees"] });
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data) return <p className="px-4 pb-4 text-sm text-muted-foreground">Loading…</p>;
  const select = "h-8 rounded-md border border-input bg-transparent px-2 text-xs dark:bg-input/30";
  const linked = (r: MapRow) => !!(r.userId || r.providerId);
  const rows = [...data.assignees].sort((a, b) => Number(linked(a)) - Number(linked(b)) || b.open - a.open);
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2">Asana assignee</th>
            <th className="px-3 py-2 text-right">Open</th>
            <th className="px-3 py-2">Team member / provider</th>
            <th className="px-3 py-2">Department</th>
            <th className="px-3 py-2">Counts?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.assigneeKey} className={cn("border-t border-border/40", r.excluded && "opacity-50")}>
              <td className="px-4 py-1.5">
                <div className="font-medium">{r.assigneeName ?? r.assigneeKey}</div>
                {!r.assigneeKey.startsWith("name:") && <div className="text-[11px] text-muted-foreground">{r.assigneeKey}</div>}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{r.open}</td>
              <td className="px-3 py-1.5">
                <select
                  aria-label={`Team member or provider for ${r.assigneeName ?? r.assigneeKey}`}
                  value={r.userId ? `u:${r.userId}` : r.providerId ? `p:${r.providerId}` : ""}
                  onChange={(e) => {
                    const [kind, id] = e.target.value.split(":");
                    save.mutate(
                      kind === "u"
                        ? { assigneeKey: r.assigneeKey, userId: id }
                        : kind === "p"
                          ? { assigneeKey: r.assigneeKey, providerId: id }
                          : { assigneeKey: r.assigneeKey, userId: null, providerId: null },
                    );
                  }}
                  className={select}
                >
                  <option value="">— Not linked —</option>
                  <optgroup label="Team">
                    {people.map((p) => (
                      <option key={p.id} value={`u:${p.id}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                  {data.providers.length > 0 && (
                    <optgroup label="Service providers">
                      {data.providers.map((p) => (
                        <option key={p.id} value={`p:${p.id}`}>
                          {p.name}
                          {p.status === "inactive" ? " (inactive)" : ""}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <select
                  aria-label={`Department for ${r.assigneeName ?? r.assigneeKey}`}
                  value={r.department ?? ""}
                  onChange={(e) => save.mutate({ assigneeKey: r.assigneeKey, department: e.target.value || null })}
                  className={select}
                >
                  <option value="">From their profile / provider</option>
                  {data.departments.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={!r.excluded} onChange={(e) => save.mutate({ assigneeKey: r.assigneeKey, excluded: !e.target.checked })} />
                  {r.excluded ? "Excluded" : "Counts"}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
