"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { TimeInsights } from "@/lib/time-logs/insights";
import { ESTIMATE_DEPARTMENTS } from "@/lib/time-logs/catalog";
import { Card, h2 } from "./hours-insights-tab";

type Row = TimeInsights["clientVsEstimate"][number];
type Dept = Row["departments"][number];

const TH = "px-2 py-1.5 whitespace-nowrap";
const NUM = "px-2 py-1.5 text-right tabular-nums";

/**
 * Client hours vs estimate, with a department breakdown: each client opens
 * into its hours by type of work next to that department's own estimate
 * (monthly split edited here, prorated to the range like the AAC total).
 * The last row totals every client, also by department.
 */
export function ClientEstimatesCard({ data }: { data: TimeInsights }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const rows = data.clientVsEstimate;
  const total = totalsOf(rows);

  return (
    <Card
      title="Client hours vs estimate"
      subtitle="Estimate = the client's monthly Estimated Hours (AAC table), prorated to the range. Open a client to compare each department with its own estimate (edit the monthly split there). Hours over the estimate are work the client isn't paying for."
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <th className={TH}>Client</th>
            <th className={cn(TH, "text-right")}>Hours</th>
            <th className={cn(TH, "text-right")}>Monthly estimate</th>
            <th className={cn(TH, "text-right")}>Estimate (range)</th>
            <th className={TH}>Used</th>
            <th className={cn(TH, "text-right")}>Over estimate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const isOpen = open.has(c.client);
            return (
              <Fragment key={c.client}>
                <tr className="cursor-pointer border-t border-border/40 hover:bg-muted/30" onClick={() => toggle(c.client)}>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
                      <Link href={`/clients/${encodeURIComponent(c.client)}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        <span className="font-mono text-xs">{c.client}</span> <span className="text-xs text-muted-foreground">{c.clientName}</span>
                      </Link>
                      {c.monthlySplitTotal == null && c.estimate != null && <span className="rounded bg-muted px-1.5 text-[9px] font-semibold uppercase text-muted-foreground">no split</span>}
                    </span>
                  </td>
                  <td className={NUM}>{h2(c.hours)}</td>
                  <td className={NUM}>{c.monthlyEstimate ?? "—"}</td>
                  <td className={NUM}>{c.estimate != null ? h2(c.estimate) : "—"}</td>
                  <td className="px-2 py-1.5">{c.usedPct != null ? <UsedBar pct={c.usedPct} /> : "—"}</td>
                  <td className={NUM}>{c.overEstimate ? <span className="font-semibold text-red-500">{h2(c.overEstimate)}</span> : "—"}</td>
                </tr>
                {isOpen &&
                  (editing === c.client ? (
                    <tr>
                      <td colSpan={6} className="bg-muted/20 px-2 py-3">
                        <SplitEditor row={c} onDone={() => setEditing(null)} />
                      </td>
                    </tr>
                  ) : (
                    <>
                      <DeptRows depts={c.departments} />
                      <tr>
                        <td colSpan={6} className="bg-muted/20 px-2 pb-2 pl-8 text-xs text-muted-foreground">
                          {c.monthlySplitTotal != null ? (
                            <>
                              Split adds up to <b className="text-foreground">{h2(c.monthlySplitTotal)} h/month</b>
                              {c.monthlyEstimate != null && Math.abs(c.monthlySplitTotal - c.monthlyEstimate) > 0.01 && (
                                <span className="text-amber-600 dark:text-amber-400"> · AAC total is {c.monthlyEstimate} h</span>
                              )}
                            </>
                          ) : (
                            "No department split yet."
                          )}{" "}
                          <button type="button" onClick={() => setEditing(c.client)} className="ml-1 inline-flex items-center gap-1 font-semibold text-foreground hover:underline">
                            <Pencil className="size-3" /> Edit split
                          </button>
                        </td>
                      </tr>
                    </>
                  ))}
              </Fragment>
            );
          })}
          <tr className="cursor-pointer border-t-2 border-border bg-muted/40 font-semibold hover:bg-muted/60" onClick={() => toggle("__total__")}>
            <td className="px-2 py-1.5">
              <span className="inline-flex items-center gap-1.5">
                {open.has("__total__") ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                Total · {rows.length} clients
              </span>
            </td>
            <td className={NUM}>{h2(total.hours)}</td>
            <td className={NUM}>{h2(total.monthlyEstimate)}</td>
            <td className={NUM}>{h2(total.estimate)}</td>
            <td className="px-2 py-1.5">{total.estimate > 0 ? <UsedBar pct={Math.round((total.hoursWithEstimate / total.estimate) * 100)} /> : "—"}</td>
            <td className={NUM}>{total.over ? <span className="text-red-500">{h2(total.over)}</span> : "—"}</td>
          </tr>
          {open.has("__total__") && <DeptRows depts={total.departments} />}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Total &ldquo;Used&rdquo; compares only the hours of clients that have an estimate. By department, the estimate column only counts clients with a split.
      </p>
    </Card>
  );
}

function DeptRows({ depts }: { depts: Dept[] }) {
  if (!depts.length) {
    return (
      <tr>
        <td colSpan={6} className="bg-muted/20 px-2 py-2 pl-8 text-xs text-muted-foreground">
          No hours or estimates by department in this range.
        </td>
      </tr>
    );
  }
  return (
    <>
      {depts.map((d) => {
        const over = d.estimate != null ? Math.max(0, d.hours - d.estimate) : 0;
        return (
          <tr key={d.department} className="bg-muted/20 text-xs">
            <td className="px-2 py-1 pl-8 text-muted-foreground">{d.department}</td>
            <td className={cn(NUM, "py-1")}>{h2(d.hours)}</td>
            <td className={cn(NUM, "py-1 text-muted-foreground")}>{d.monthlyEstimate ?? "—"}</td>
            <td className={cn(NUM, "py-1 text-muted-foreground")}>{d.estimate != null ? h2(d.estimate) : "—"}</td>
            <td className="px-2 py-1">{d.usedPct != null ? <UsedBar pct={d.usedPct} /> : "—"}</td>
            <td className={cn(NUM, "py-1")}>{over ? <span className="font-semibold text-red-500">{h2(over)}</span> : "—"}</td>
          </tr>
        );
      })}
    </>
  );
}

/** Every client added up, and every client's departments added up. */
function totalsOf(rows: Row[]) {
  const byDept = new Map<string, { hours: number; monthly: number | null; estimate: number | null }>();
  let hours = 0,
    monthlyEstimate = 0,
    estimate = 0,
    hoursWithEstimate = 0,
    over = 0;
  for (const c of rows) {
    hours += c.hours;
    if (c.estimate != null) {
      monthlyEstimate += c.monthlyEstimate ?? 0;
      estimate += c.estimate;
      hoursWithEstimate += c.hours;
    }
    over += c.overEstimate ?? 0;
    for (const d of c.departments) {
      const t = byDept.get(d.department) ?? { hours: 0, monthly: null, estimate: null };
      t.hours += d.hours;
      if (d.monthlyEstimate != null) t.monthly = (t.monthly ?? 0) + d.monthlyEstimate;
      if (d.estimate != null) t.estimate = (t.estimate ?? 0) + d.estimate;
      byDept.set(d.department, t);
    }
  }
  const departments: Dept[] = [...byDept]
    .map(([department, t]) => ({
      department,
      hours: t.hours,
      monthlyEstimate: t.monthly != null ? Math.round(t.monthly * 100) / 100 : null,
      estimate: t.estimate,
      usedPct: t.estimate ? Math.round((t.hours / t.estimate) * 100) : null,
    }))
    .sort((a, b) => b.hours - a.hours);
  return { hours, monthlyEstimate, estimate, hoursWithEstimate, over, departments };
}

/** Monthly hours per department for one client; blank = no estimate for it. */
function SplitEditor({ row, onDone }: { row: Row; onDone: () => void }) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(row.departments.filter((d) => d.monthlyEstimate != null).map((d) => [d.department, String(d.monthlyEstimate)])),
  );
  const sum = Object.values(values).reduce((a, v) => a + (Number(v) > 0 ? Number(v) : 0), 0);
  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/time-logs/estimates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client: row.client, estimates: values }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      return json;
    },
    onSuccess: () => {
      toast.success(`Saved ${row.client}'s estimate by department`);
      qc.invalidateQueries({ queryKey: ["time-insights"] });
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3 pl-6">
      <p className="text-xs text-muted-foreground">
        Monthly estimated hours for <b className="text-foreground">{row.clientName}</b> by department. Leave blank for none.
      </p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {ESTIMATE_DEPARTMENTS.map((d) => (
          <label key={d} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{d}</span>
            <input
              type="number"
              min={0}
              step={0.25}
              inputMode="decimal"
              value={values[d] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [d]: e.target.value }))}
              className="h-7 w-20 rounded-md border border-input bg-transparent px-2 text-right text-xs tabular-nums dark:bg-input/30"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span>
          Total <b className="tabular-nums">{h2(sum)} h/month</b>
          {row.monthlyEstimate != null && (
            <span className={cn("ml-1", Math.abs(sum - row.monthlyEstimate) > 0.01 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
              · AAC total {row.monthlyEstimate} h
            </span>
          )}
        </span>
        <button
          type="button"
          disabled={save.isPending}
          onClick={() => save.mutate()}
          className="ml-auto rounded-md bg-brand px-3 py-1 text-xs font-semibold text-brand-foreground disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save split"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border px-3 py-1 text-xs">
          Cancel
        </button>
      </div>
    </div>
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
