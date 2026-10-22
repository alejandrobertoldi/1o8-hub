"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, Download, FileSpreadsheet, Loader2, Sheet as SheetIcon, X } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import {
  clientLabel,
  computeKpis,
  topMembers,
  topClients,
  buildHeatmap,
  filterSummary,
  buildCategoryQuery,
  fmtHM,
  buildAgencyBreakdown,
  type Summary,
  type InternalBreakdownRow,
} from "@/lib/hours/dashboard-utils";
import { DatePicker } from "@/components/ui/date-picker";
import { DailyHoursHeatmap } from "@/components/admin/daily-hours-heatmap";
import { RangeScopeDetail } from "@/components/admin/hours-entries-table";
import { AgencyHoursBreakdown } from "@/components/admin/marketfoundry-hours-breakdown";

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: isoDate(first), to: isoDate(last) };
}

// Locale-aware number grouping (thousands separator + decimal per viewer locale).
// Safe from hydration mismatch: the dashboard body only renders client-side, after data loads.
function fmtNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const CARD = "rounded-xl border border-stone-200 bg-card p-4 dark:border-zinc-800";
const TOOLTIP_STYLE = {
  background: "var(--popover, var(--background))",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  fontSize: 12,
} as const;

function MultiSelect({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: { id: string; label: string; internal?: boolean }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const count = selected.length;
  return (
    <div className="relative">
      <Button
        variant={count > 0 ? "default" : "outline"}
        size="sm"
        className="gap-1"
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {count > 0 ? ` (${count})` : ""}
        <ChevronDown className="size-3" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-border bg-background p-1 shadow-lg">
            {items.map((it) => {
              const active = selected.includes(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onToggle(it.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors hover:bg-muted/50 ${
                    active ? "text-brand" : "text-muted-foreground"
                  }`}
                >
                  <Checkbox checked={active} className="size-3.5" tabIndex={-1} />
                  <span className="truncate">{it.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function HoursDashboard() {
  const initial = useMemo(() => currentMonthRange(), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [pivot, setPivot] = useState<"member" | "client">("client");
  const [memberFilter, setMemberFilter] = useState<string[]>([]);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportingSheet, setExportingSheet] = useState(false);

  const { data, isLoading, error } = useQuery<
    Summary & { internalBreakdown?: { rows: InternalBreakdownRow[] } }
  >({
    queryKey: ["hours-summary", from, to, categoryFilter],
    queryFn: async () => {
      const res = await fetch(`/api/hours/summary?from=${from}&to=${to}${buildCategoryQuery(categoryFilter)}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load summary");
      return res.json();
    },
  });

  const { data: clientList } = useQuery<{ clientIdCode: string; clientName: string }[]>({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const res = await fetch("/api/clients/list");
      if (!res.ok) return [];
      return res.json();
    },
  });
  const clientNameMap = useMemo(
    () => new Map((clientList ?? []).map((c) => [c.clientIdCode, c.clientName])),
    [clientList],
  );

  const filtered = useMemo<Summary>(
    () => (data ? filterSummary(data, memberFilter, clientFilter) : { byMember: [], byClient: [], categories: [] }),
    [data, memberFilter, clientFilter],
  );
  const kpis = useMemo(() => computeKpis(filtered), [filtered]);
  const memberBars = useMemo(() => topMembers(filtered, filtered.byMember.length), [filtered]);
  const clientBars = useMemo(() => topClients(filtered, filtered.byClient.length), [filtered]);
  const heat = useMemo(() => buildHeatmap(filtered), [filtered]);
  const maxHeat = useMemo(
    () => Math.max(1, ...heat.members.flatMap((m) => heat.clients.map((c) => heat.cell(m.userId, c.code)))),
    [heat],
  );
  const mfBreakdown = useMemo(() => {
    if (clientFilter.length > 0 && !clientFilter.includes("INTERNAL")) return null;
    let rows = data?.internalBreakdown?.rows ?? [];
    if (memberFilter.length > 0) {
      const allowed = new Set(memberFilter);
      rows = rows.filter((r) => allowed.has(r.userId));
    }
    return buildAgencyBreakdown(rows, kpis.totalHours);
  }, [data?.internalBreakdown?.rows, memberFilter, clientFilter, kpis.totalHours]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleIn(list: string[], set: (v: string[]) => void, id: string) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }
  function clearFilters() {
    setMemberFilter([]);
    setClientFilter([]);
    setCategoryFilter([]);
  }

  // Mirrors every dashboard filter so the export matches what's on screen.
  function exportQuery(): string {
    const p = new URLSearchParams({ from, to });
    memberFilter.forEach((id) => p.append("userId", id));
    clientFilter.forEach((c) => p.append("client", c));
    categoryFilter.forEach((c) => p.append("category", c));
    return p.toString();
  }

  async function handleExport() {
    setExporting(true);
    const toastId = toast.loading("Preparing export…");
    try {
      const res = await fetch(`/api/hours/admin-export?${exportQuery()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team_hours_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported team hours", { id: toastId });
    } catch (err) {
      toast.error(`Export failed: ${err instanceof Error ? err.message : "Unknown error"}`, { id: toastId });
    } finally {
      setExporting(false);
    }
  }

  async function handleExportToSheet() {
    setExportingSheet(true);
    const toastId = toast.loading("Saving to Google Sheets…");
    try {
      const res = await fetch(`/api/hours/admin-export?${exportQuery()}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      toast.success(`Saved ${json.count} entries to Google Sheets`, {
        id: toastId,
        action: { label: "Open", onClick: () => window.open(json.sheetUrl, "_blank", "noopener") },
        duration: 12000,
      });
    } catch (err) {
      toast.error(
        `Failed to save to Sheets: ${err instanceof Error ? err.message : "Unknown error"}`,
        { id: toastId },
      );
    } finally {
      setExportingSheet(false);
    }
  }

  const exportBusy = exporting || exportingSheet;
  const hasFilters = memberFilter.length + clientFilter.length + categoryFilter.length > 0;
  const empty = !isLoading && !error && filtered.byMember.length === 0 && filtered.byClient.length === 0;

  return (
    <div className="space-y-6">
      {/* Controls — single row, pinned below the top nav */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <DatePicker value={from} onChange={(v) => v && setFrom(v)} className="h-8 w-40" />
        <DatePicker value={to} onChange={(v) => v && setTo(v)} className="h-8 w-40" />
        <div className="flex gap-1">
          <Button variant={pivot === "client" ? "default" : "outline"} size="sm" onClick={() => { setPivot("client"); setExpanded(new Set()); }}>
            By client
          </Button>
          <Button variant={pivot === "member" ? "default" : "outline"} size="sm" onClick={() => { setPivot("member"); setExpanded(new Set()); }}>
            By member
          </Button>
        </div>
        {data && (
          <>
            <MultiSelect
              label="Members"
              items={data.byMember.map((m) => ({ id: m.userId, label: m.name ?? m.email }))}
              selected={memberFilter}
              onToggle={(id) => toggleIn(memberFilter, setMemberFilter, id)}
            />
            <MultiSelect
              label="Clients"
              items={data.byClient.map((c) => ({ id: c.clientIdCode, label: clientLabel(c.clientIdCode) }))}
              selected={clientFilter}
              onToggle={(id) => toggleIn(clientFilter, setClientFilter, id)}
            />
            <MultiSelect
              label="Categories"
              items={data.categories.map((c) => ({ id: c, label: c }))}
              selected={categoryFilter}
              onToggle={(id) => toggleIn(categoryFilter, setCategoryFilter, id)}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="size-3" /> Clear
              </Button>
            )}
          </>
        )}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={exportBusy || empty}
                className="h-8 rounded-md px-3 text-xs"
                title="Export filtered hours"
              >
                {exportBusy ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Download className="size-3.5 mr-1" />
                )}
                {exporting ? "Exporting…" : exportingSheet ? "Saving to Sheets…" : "Export"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onClick={handleExport} disabled={exportBusy}>
                <FileSpreadsheet className="size-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Download as Excel</span>
                  <span className="text-[10px] text-muted-foreground">.xlsx file, current dates + filters</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportToSheet} disabled={exportBusy}>
                <SheetIcon className="size-3.5 mr-2" />
                <div className="flex flex-col">
                  <span>Save to Google Sheets</span>
                  <span className="text-[10px] text-muted-foreground">→ 1o8_Hours_Exports in the shared Drive</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{(error as Error).message}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">No hours logged in this range.</p>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Total hours", value: `${fmtHM(kpis.totalHours)}` },
              { label: "Active members", value: fmtNum(kpis.activeMembers) },
              { label: "Active clients", value: fmtNum(kpis.activeClients) },
              { label: "Avg / member", value: `${fmtHM(kpis.avgHoursPerMember)}` },
            ].map((k) => (
              <div key={k.label} className={CARD}>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">{k.label}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
              </div>
            ))}
          </div>

          {/* Two bar charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: "All members", bars: memberBars },
              { title: "All clients", bars: clientBars },
            ].map((chart) => (
              <div key={chart.title} className={CARD}>
                <div className="mb-2 text-sm font-medium">{chart.title}</div>
                {chart.bars.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">No data</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(120, chart.bars.length * 34)}>
                    <BarChart layout="vertical" data={chart.bars} margin={{ left: 8, right: 40 }}>
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
                        {chart.bars.map((b) => (
                          <Cell key={b.key} fill={b.key === "INTERNAL" ? "var(--brand)" : "var(--chart-1)"} />
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
            ))}
          </div>

          {mfBreakdown && <AgencyHoursBreakdown breakdown={mfBreakdown} />}

          {/* Member × client heatmap */}
          {heat.members.length > 0 && heat.clients.length > 0 && (
            <div className={CARD}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">Member × client hours</div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{fmtHM(0)}</span>
                  <div
                    className="h-2 w-24 rounded"
                    style={{ background: "linear-gradient(to right, color-mix(in srgb, var(--brand) 6%, transparent), var(--brand))" }}
                  />
                  <span className="tabular-nums">{fmtHM(maxHeat)}</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div
                  className="grid w-full gap-1 text-xs"
                  style={{ gridTemplateColumns: `minmax(120px, max-content) repeat(${heat.clients.length}, minmax(2.75rem, 1fr))` }}
                >
                  <div />
                  {heat.clients.map((c) => {
                    const name = c.code === "INTERNAL" ? "1o8" : (clientNameMap.get(c.code) ?? c.code);
                    return (
                      <div
                        key={c.code}
                        className={`flex flex-col items-center justify-end gap-0.5 px-0.5 pb-1 text-center ${c.code === "INTERNAL" ? "text-brand" : "text-muted-foreground"}`}
                      >
                        <span className="text-[9px] font-semibold leading-tight" title={name}>{name}</span>
                        <span className="text-[8px] font-medium leading-tight opacity-70">{c.code}</span>
                      </div>
                    );
                  })}
                  {heat.members.map((m) => (
                    <Fragment key={m.userId}>
                      <div className="truncate pr-2 text-[11px] font-medium text-muted-foreground">{m.label}</div>
                      {heat.clients.map((c) => {
                        const v = heat.cell(m.userId, c.code);
                        const pct = Math.round((v / maxHeat) * 100);
                        return (
                          <div
                            key={c.code}
                            title={`${m.label} × ${c.label}: ${fmtHM(v)}`}
                            className="flex h-8 items-center justify-center rounded border border-stone-200 text-[9px] font-medium tabular-nums text-foreground/80 dark:border-zinc-800"
                            style={{
                              backgroundColor: v > 0 ? `color-mix(in srgb, var(--brand) ${pct}%, transparent)` : "transparent",
                            }}
                          >
                            {v > 0 ? fmtHM(v) : ""}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DailyHoursHeatmap from={from} to={to} categories={categoryFilter} clientNameMap={clientNameMap} />

          {/* Date-range scope detail — same layout as day detail */}
          <div className="space-y-3">
            {pivot === "client"
              ? filtered.byClient.map((c) => (
                  <RangeScopeDetail
                    key={c.clientIdCode}
                    label={clientLabel(c.clientIdCode)}
                    brand={c.clientIdCode === "INTERNAL"}
                    from={from}
                    to={to}
                    hours={c.totalHours}
                    clientIdCode={c.clientIdCode}
                    categories={categoryFilter}
                    open={expanded.has(c.clientIdCode)}
                    onToggle={() => toggle(c.clientIdCode)}
                    showMember
                    showClient={false}
                  />
                ))
              : filtered.byMember.map((m) => (
                  <RangeScopeDetail
                    key={m.userId}
                    label={m.name ?? m.email}
                    from={from}
                    to={to}
                    hours={m.totalHours}
                    userId={m.userId}
                    categories={categoryFilter}
                    open={expanded.has(m.userId)}
                    onToggle={() => toggle(m.userId)}
                    showMember={false}
                    showClient
                  />
                ))}
          </div>
        </>
      )}
    </div>
  );
}
