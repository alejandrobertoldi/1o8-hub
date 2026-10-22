"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TimeLog } from "@/lib/db/schema";
import type { LoggableClient, LoggableProject } from "@/lib/time-logs/server";

type Options = {
  me: string;
  isAdmin: boolean;
  clients: LoggableClient[];
  workTypes: string[];
  settings: { dailyMinimumHours: number; hourStep: number };
  people: { id: string; name: string | null }[];
};

// ── date helpers (local calendar days, YYYY-MM-DD) ──
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T00:00:00`);
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const mondayOf = (s: string) => {
  const d = parse(s);
  return addDays(s, -((d.getDay() + 6) % 7));
};
const isWeekday = (s: string) => {
  const wd = parse(s).getDay();
  return wd !== 0 && wd !== 6;
};
const fmtDay = (s: string, opts: Intl.DateTimeFormatOptions) => parse(s).toLocaleDateString("en-US", opts);
const fmtHours = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

type Form = { entryDate: string; hours: string; clientIdCode: string; department: string; projectNumber: string; note: string };

export function Timesheet() {
  const qc = useQueryClient();
  const today = iso(new Date());
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [personId, setPersonId] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm: Form = { entryDate: today, hours: "", clientIdCode: "", department: "", projectNumber: "", note: "" };
  const [form, setForm] = useState<Form>(emptyForm);
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: options } = useQuery<Options>({
    queryKey: ["time-log-options"],
    queryFn: async () => (await fetch("/api/time-logs/options")).json(),
    staleTime: 5 * 60_000,
  });
  const userId = personId || options?.me || "";
  const weekEnd = addDays(weekStart, 6);
  const windowStart = addDays(today, -13); // last 14 days, for the under-minimum count

  const logsKey = ["time-logs", userId, weekStart] as const;
  const { data: logs = [], isLoading } = useQuery<TimeLog[]>({
    queryKey: logsKey,
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/time-logs?from=${weekStart}&to=${weekEnd}&userId=${userId}`);
      if (!res.ok) throw new Error("Could not load your hours");
      return res.json();
    },
  });
  const { data: recent = [] } = useQuery<TimeLog[]>({
    queryKey: ["time-logs-recent", userId, today],
    enabled: !!userId,
    queryFn: async () => (await fetch(`/api/time-logs?from=${windowStart}&to=${today}&userId=${userId}`)).json(),
  });

  const { data: projectData, isFetching: loadingProjects } = useQuery<{ projects: LoggableProject[]; narrowed: boolean }>({
    queryKey: ["time-log-projects", form.clientIdCode, form.department],
    enabled: !!form.clientIdCode,
    queryFn: async () =>
      (await fetch(`/api/time-logs/projects?client=${encodeURIComponent(form.clientIdCode)}&department=${encodeURIComponent(form.department)}`)).json(),
  });
  const projects = projectData?.projects ?? [];
  // Keep the chosen project valid when client/department change.
  useEffect(() => {
    if (form.projectNumber && projectData && !projects.some((p) => p.projectNumber === form.projectNumber) && !editingId) {
      set("projectNumber", "");
    }
  }, [projectData]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["time-logs", userId] });
    qc.invalidateQueries({ queryKey: ["time-logs-recent", userId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, hours: Number(form.hours), userId };
      const res = await fetch(editingId ? `/api/time-logs/${editingId}` : "/api/time-logs", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not save");
    },
    onSuccess: () => {
      toast.success(editingId ? "Entry updated" : "Time logged");
      setEditingId(null);
      // Keep date/client/department for fast repeat entry.
      setForm((f) => ({ ...f, hours: "", projectNumber: editingId ? "" : f.projectNumber, note: "" }));
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/time-logs/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete");
    },
    onSuccess: () => {
      toast.success("Entry deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of logs) t[l.entryDate] = (t[l.entryDate] ?? 0) + Number(l.hours);
    return t;
  }, [logs]);
  const weekTotal = Object.values(totals).reduce((a, b) => a + b, 0);
  const min = options?.settings.dailyMinimumHours ?? 8;
  const underMinimum = useMemo(() => {
    const t: Record<string, number> = {};
    for (const l of recent) t[l.entryDate] = (t[l.entryDate] ?? 0) + Number(l.hours);
    let n = 0;
    for (let d = windowStart; d <= today; d = addDays(d, 1)) if (isWeekday(d) && (t[d] ?? 0) < min) n++;
    return n;
  }, [recent, windowStart, today, min]);

  const clientName = (code: string) => options?.clients.find((c) => c.code === code)?.name ?? code;
  const canSave = form.entryDate && Number(form.hours) > 0 && form.clientIdCode && form.department && form.projectNumber;

  function startEdit(l: TimeLog) {
    setEditingId(l.id);
    setForm({
      entryDate: l.entryDate,
      hours: String(Number(l.hours)),
      clientIdCode: l.clientIdCode,
      department: l.department,
      projectNumber: l.projectNumber,
      note: l.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const select = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-52 text-center text-sm font-semibold">
            {fmtDay(weekStart, { month: "short", day: "numeric" })} – {fmtDay(weekEnd, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            <ChevronRight className="size-4" />
          </Button>
          {weekStart !== mondayOf(today) && (
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(today))}>
              This week
            </Button>
          )}
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-lg bg-muted px-3 py-1.5">
            Hours this week <span className="ml-1 font-bold tabular-nums">{fmtHours(weekTotal)}</span>
          </span>
          <span className={cn("rounded-lg px-3 py-1.5", underMinimum ? "bg-red-500/15 text-red-500" : "bg-muted")}>
            Workdays under {min}h (last 14 days) <span className="ml-1 font-bold tabular-nums">{underMinimum}</span>
          </span>
        </div>
        {options?.isAdmin && (
          <select
            aria-label="Team member"
            value={personId}
            onChange={(e) => {
              setPersonId(e.target.value);
              setEditingId(null);
            }}
            className={cn(select, "ml-auto w-56")}
          >
            <option value="">My hours</option>
            {options.people
              .filter((p) => p.id !== options.me)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        )}
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const total = totals[d] ?? 0;
          const short = isWeekday(d) && d <= today && total < min;
          return (
            <button
              key={d}
              type="button"
              onClick={() => set("entryDate", d)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-colors hover:border-brand",
                form.entryDate === d && "border-brand",
                d === today && "bg-muted/50",
              )}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{fmtDay(d, { weekday: "short", day: "numeric" })}</div>
              <div className={cn("text-lg font-bold tabular-nums", short ? "text-red-500" : total ? "" : "text-muted-foreground/60")}>{fmtHours(total)}</div>
            </button>
          );
        })}
      </div>

      {/* Entry form */}
      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">{editingId ? "Edit entry" : "Log time"}</h2>
          <span className="text-xs text-muted-foreground">
            Fill in Date, Hours, Client, Department and Project. Billing type is set automatically.
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-[9rem_6rem_1fr_12rem]">
          <Field label="Date">
            <Input type="date" value={form.entryDate} onChange={(e) => set("entryDate", e.target.value)} />
          </Field>
          <Field label="Hours">
            <Input
              type="number"
              min={0.25}
              max={24}
              step={options?.settings.hourStep ?? 0.25}
              value={form.hours}
              placeholder="1.5"
              onChange={(e) => set("hours", e.target.value)}
              className="tabular-nums"
            />
          </Field>
          <Field label="Client">
            <select value={form.clientIdCode} onChange={(e) => set("clientIdCode", e.target.value)} className={select}>
              <option value="">Pick a client…</option>
              {options?.clients.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} | {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department / type of work">
            <select value={form.department} onChange={(e) => set("department", e.target.value)} className={select}>
              <option value="">Pick one…</option>
              {options?.workTypes.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Field
            label="Project / task"
            hint={
              form.clientIdCode && projectData
                ? projectData.narrowed
                  ? `${projects.length - 1} ${form.department} tasks for ${form.clientIdCode} (open or completed in the last 14 days)`
                  : `${projects.length} options. Use ${form.clientIdCode === "1O8" ? "an internal code" : `${form.clientIdCode}00000`} if there is no Asana task.`
                : undefined
            }
          >
            <select
              value={form.projectNumber}
              disabled={!form.clientIdCode || loadingProjects}
              onChange={(e) => set("projectNumber", e.target.value)}
              className={select}
            >
              <option value="">{form.clientIdCode ? (loadingProjects ? "Loading…" : "Pick a project…") : "Pick a client first"}</option>
              {projects.map((p) => (
                <option key={p.projectNumber} value={p.projectNumber}>
                  {p.projectNumber} | {p.name}
                  {p.status === "Completed" ? " (completed)" : ""}
                </option>
              ))}
              {editingId && form.projectNumber && !projects.some((p) => p.projectNumber === form.projectNumber) && (
                <option value={form.projectNumber}>{form.projectNumber} (kept from the original entry)</option>
              )}
            </select>
          </Field>
          <Field label="Notes (optional)">
            <Input value={form.note} onChange={(e) => set("note", e.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            {editingId && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </Button>
            )}
            <Button variant="brand" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : editingId ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </section>

      {/* Entries */}
      <section className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-3 py-2.5 text-right">Hours</th>
              <th className="px-3 py-2.5">Client</th>
              <th className="px-3 py-2.5">Department</th>
              <th className="px-3 py-2.5">Project</th>
              <th className="px-3 py-2.5">Billing</th>
              <th className="px-3 py-2.5">Notes</th>
              <th className="px-3 py-2.5" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className={cn("border-b border-border/50 last:border-0", editingId === l.id && "bg-muted/40")}>
                <td className="px-4 py-2 whitespace-nowrap">{fmtDay(l.entryDate, { weekday: "short", month: "short", day: "numeric" })}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtHours(Number(l.hours))}</td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs">{l.clientIdCode}</span>{" "}
                  <span className="text-xs text-muted-foreground">{clientName(l.clientIdCode)}</span>
                </td>
                <td className="px-3 py-2 text-xs">{l.department}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs">{l.projectNumber}</span>
                    {l.asanaTaskGid && (
                      <a
                        href={`https://app.asana.com/0/0/${l.asanaTaskGid}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open in Asana"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <div className="max-w-80 truncate text-xs text-muted-foreground" title={l.projectName}>
                    {l.projectName}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{l.billingType}</td>
                <td className="max-w-56 truncate px-3 py-2 text-xs text-muted-foreground" title={l.note ?? ""}>
                  {l.note}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit entry" onClick={() => startEdit(l)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete entry"
                      onClick={() => window.confirm("Delete this entry?") && remove.mutate(l.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {isLoading ? "Loading…" : "Nothing logged this week yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
