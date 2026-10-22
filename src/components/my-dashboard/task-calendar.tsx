"use client";
import { useState } from "react";
import { AlarmClock, ChevronLeft, ChevronRight } from "lucide-react";
import type { DashTask } from "@/lib/my-dashboard/types";
import { isHighPriority } from "@/lib/my-dashboard/group-tasks";
import { monthGrid, shiftMonth, tasksByDate } from "@/lib/my-dashboard/calendar";

/** Chips shown per day before collapsing the rest into "+N more". */
const CHIPS_PER_DAY = 3;
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Asana-style: weekends get half-width columns.
const GRID_COLS = "grid-cols-[0.5fr_repeat(5,minmax(0,1fr))_0.5fr]";

/** Upcoming = solid fill; overdue = white chip with a source-coloured border/text in BOTH themes + alarm icon. */
const chipClass = (source: DashTask["source"], overdue: boolean) =>
  source === "asana"
    ? overdue ? "border-asana bg-white text-asana" : "border-transparent bg-asana text-white"
    : overdue ? "border-brand bg-white text-neutral-900" : "border-transparent bg-brand/15 text-foreground";

const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });

export function TaskCalendar({ tasks, today, selected, onSelect }: {
  tasks: DashTask[]; today: string; selected: string | null; onSelect: (d: string | null) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const { byDate, undated } = tasksByDate(tasks);
  const weeks = monthGrid(month);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded p-1 hover:bg-muted" aria-label="Previous month"><ChevronLeft className="size-4" /></button>
        <button type="button" onClick={() => setMonth(today.slice(0, 7))} className="rounded px-2 py-0.5 text-xs hover:bg-muted">Today</button>
        <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="rounded p-1 hover:bg-muted" aria-label="Next month"><ChevronRight className="size-4" /></button>
        <span className="font-medium">{monthLabel(month)}</span>
        <span className="ml-auto text-xs text-muted-foreground">No date ({undated})</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className={`grid ${GRID_COLS} border-b text-[11px] uppercase tracking-wide text-muted-foreground`}>
            {DAY_NAMES.map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className={`grid ${GRID_COLS} border-b last:border-b-0`}>
              {week.map((date) => {
                const dayTasks = byDate.get(date) ?? [];
                const inMonth = date.startsWith(month);
                const isToday = date === today;
                const overdue = date < today; // open tasks only reach the calendar, so a past date = overdue
                return (
                  <div key={date} role="button" tabIndex={0} aria-label={`Show tasks due ${date}`}
                    onClick={() => dayTasks.length && onSelect(selected === date ? null : date)}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && dayTasks.length) { e.preventDefault(); onSelect(selected === date ? null : date); } }}
                    className={`flex min-h-24 min-w-0 flex-col gap-1 border-r p-1 last:border-r-0 ${selected === date ? "bg-muted" : ""} ${dayTasks.length ? "cursor-pointer hover:bg-muted/50" : ""}`}>
                    <span className={`self-start rounded px-1 text-xs tabular-nums ${isToday ? "bg-brand font-semibold text-brand-foreground" : inMonth ? "text-foreground" : "text-muted-foreground/50"} ${overdue && dayTasks.length ? "text-brand-red line-through" : ""}`}>
                      {Number(date.slice(8))}
                    </span>
                    {dayTasks.slice(0, CHIPS_PER_DAY).map((t) => (
                      <a key={t.id} href={t.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title={overdue ? `Overdue: ${t.title}` : t.title}
                        className={`flex items-center gap-1 truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight hover:opacity-80 ${chipClass(t.source, overdue)}`}>
                        {overdue && <AlarmClock className="size-3 shrink-0" aria-label="Overdue" />}
                        {isHighPriority(t.priority) && <span className="size-1.5 shrink-0 rounded-full bg-brand-red" />}
                        <span className="truncate">{t.title}</span>
                      </a>
                    ))}
                    {dayTasks.length > CHIPS_PER_DAY && (
                      <span className="px-1 text-[11px] text-muted-foreground">+{dayTasks.length - CHIPS_PER_DAY} more</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
