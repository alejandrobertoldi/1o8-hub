"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarTask, TaskCalendarTag } from "@/lib/task-calendar";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Monday-first 6×7 grid covering the month. */
function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

export type TaskCalendarCopy = {
  /** "Sends this month" / "Campaigns this month" */
  countLabel: string;
  /** "Show sent / completed" / "Show launched / completed" */
  completedToggle: string;
  /** Heading of the list of open tasks with no Go Live Date. */
  unscheduledTitle: string;
  /** Plain-language source line under the calendar. */
  source: string;
};

/**
 * A team's Asana tasks (by 1o8 team tag) on their Go Live Date. Used by
 * Email → Send dates and Paid Media → Campaign calendar. The month header
 * mirrors the Content Calendar's (chevrons, Month Year, Today).
 */
export function TaskDateCalendar({ tag, copy }: { tag: TaskCalendarTag; copy: TaskCalendarCopy }) {
  const now = new Date();
  const today = iso(now);
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [client, setClient] = useState("");
  const [assignee, setAssignee] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);

  const days = monthGrid(cursor.y, cursor.m);
  const from = days[0];
  const to = days[days.length - 1];

  const { data, isLoading, isError } = useQuery<{ scheduled: CalendarTask[]; unscheduled: CalendarTask[] }>({
    queryKey: ["task-calendar", tag, from, to],
    queryFn: async () => {
      const res = await fetch(`/api/task-calendar?tag=${encodeURIComponent(tag)}&from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Could not load the calendar");
      return res.json();
    },
  });

  const all = useMemo(() => [...(data?.scheduled ?? []), ...(data?.unscheduled ?? [])], [data]);
  const clients = useMemo(
    () => [...new Map(all.filter((t) => t.clientIdCode).map((t) => [t.clientIdCode!, t.clientName ?? t.clientIdCode!])).entries()].sort(),
    [all],
  );
  const assignees = useMemo(() => [...new Set(all.map((t) => t.assignee).filter(Boolean) as string[])].sort(), [all]);
  const keep = (t: CalendarTask) =>
    (!client || t.clientIdCode === client) && (!assignee || t.assignee === assignee) && (showCompleted || !t.completed);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarTask[]>();
    for (const t of data?.scheduled ?? []) if (keep(t)) m.set(t.goLiveDate!, [...(m.get(t.goLiveDate!) ?? []), t]);
    return m;
  }, [data, client, assignee, showCompleted]); // eslint-disable-line react-hooks/exhaustive-deps
  const unscheduled = (data?.unscheduled ?? []).filter(keep);

  const inMonth = (d: string) => Number(d.slice(5, 7)) - 1 === cursor.m;
  const monthTasks = [...byDay.entries()].filter(([d]) => inMonth(d)).flatMap(([, list]) => list);
  const late = monthTasks.filter((t) => !t.completed && t.goLiveDate! < today).length;
  const move = (delta: number) =>
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const select = "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Same month navigation as the Content Calendar */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => move(-1)}
            className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="min-w-[220px] text-center font-[family-name:var(--font-outfit)] text-2xl tracking-tight">
            {MONTH_NAMES[cursor.m]} <span className="font-normal text-muted-foreground">{cursor.y}</span>
          </h2>
          <button
            onClick={() => move(1)}
            className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="size-5" />
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursor({ y: now.getFullYear(), m: now.getMonth() })}
            className="ml-1 text-xs"
          >
            <CalendarDays className="mr-1 size-3.5" />
            Today
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-muted px-3 py-1.5 text-xs">
            {copy.countLabel} <span className="ml-1 font-bold tabular-nums">{monthTasks.length}</span>
          </span>
          <span className={cn("rounded-lg px-3 py-1.5 text-xs", late ? "bg-red-500/15 text-red-500" : "bg-muted")}>
            Past date, not done <span className="ml-1 font-bold tabular-nums">{late}</span>
          </span>
          <select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} className={select}>
            <option value="">All clients</option>
            {clients.map(([code, name]) => (
              <option key={code} value={code}>
                {code} | {name}
              </option>
            ))}
          </select>
          <select aria-label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} className={select}>
            <option value="">Everyone</option>
            {assignees.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs">
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            {copy.completedToggle}
          </label>
        </div>
      </div>

      {isError && <p className="text-sm text-red-500">Could not load the calendar.</p>}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid grid-cols-7 border-b text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            return (
              <div
                key={d}
                className={cn(
                  "min-h-28 border-b border-r border-border/50 p-1.5 [&:nth-child(7n)]:border-r-0",
                  !inMonth(d) && "bg-muted/20 opacity-60",
                )}
              >
                <div
                  className={cn(
                    "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    d === today && "bg-brand text-brand-foreground",
                  )}
                >
                  {Number(d.slice(8))}
                </div>
                <div className="flex flex-col gap-1">
                  {list.map((t) => (
                    <TaskChip key={t.gid} task={t} late={!t.completed && d < today} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <section className="rounded-xl border bg-card">
        <header className="flex items-baseline justify-between border-b px-4 py-3">
          <h2 className="text-sm font-bold">{copy.unscheduledTitle}</h2>
          <span className="text-xs text-muted-foreground">Open tasks without a Go Live Date in Asana · {unscheduled.length}</span>
        </header>
        {unscheduled.length ? (
          <ul className="divide-y divide-border/50 text-sm">
            {unscheduled.map((t) => (
              <li key={t.gid} className="flex items-center gap-3 px-4 py-2">
                <span className="w-12 shrink-0 font-mono text-xs">{t.clientIdCode ?? "—"}</span>
                <a href={t.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline" title={t.name}>
                  {t.name}
                </a>
                <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">{t.assignee ?? "Unassigned"}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.dueOn ? `Due ${t.dueOn.slice(5)}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">Every open task has a Go Live Date.</p>
        )}
      </section>
      <p className="text-[11px] text-muted-foreground">{copy.source}</p>
    </div>
  );
}

function TaskChip({ task, late }: { task: CalendarTask; late: boolean }) {
  return (
    <a
      href={task.url}
      target="_blank"
      rel="noreferrer"
      title={`${task.name}\n${task.status ?? ""}${task.assignee ? ` · ${task.assignee}` : ""}`}
      className={cn(
        "group flex items-start gap-1 rounded-md border px-1.5 py-1 text-[11px] leading-tight transition-colors hover:border-brand",
        task.completed ? "border-transparent bg-muted/50 text-muted-foreground" : "bg-background",
        late && "border-red-500/60",
      )}
    >
      {task.completed ? (
        <Check className="mt-px size-3 shrink-0 text-emerald-500" aria-label="Completed" />
      ) : (
        <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", late ? "bg-red-500" : "bg-brand")} aria-hidden />
      )}
      <span className="min-w-0">
        <span className="font-mono font-bold">{task.clientIdCode ?? "—"}</span>{" "}
        <span className="line-clamp-2">{stripCode(task.name, task.clientIdCode)}</span>
      </span>
    </a>
  );
}

/** "MSN | Email - Black Friday" → "Email - Black Friday" (the code is already shown). */
function stripCode(name: string, code: string | null) {
  if (!code) return name;
  return name.replace(new RegExp(`^(EXT:\\s*)?${code}\\s*[|\\-–I]\\s*`, "i"), "");
}
