"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  CALENDAR_FIRST_ANCHOR,
  CALENDAR_LAST_ANCHOR,
  MONTH_NAMES,
  WEEKDAY_HEADERS,
  calendarWindow,
  compareYearMonth,
  daysUntil,
  marksOnDate,
  monthGrid,
  shiftMonth,
  type HolidayCalendarMark,
  type YearMonth,
} from "@/lib/holiday-deals/calendar";
import { cn } from "@/lib/utils";

function clampAnchor(anchor: YearMonth): YearMonth {
  if (compareYearMonth(anchor, CALENDAR_FIRST_ANCHOR) < 0) return CALENDAR_FIRST_ANCHOR;
  if (compareYearMonth(anchor, CALENDAR_LAST_ANCHOR) > 0) return CALENDAR_LAST_ANCHOR;
  return anchor;
}

function formatLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

function daysLabel(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1) return `${n} days`;
  return `${Math.abs(n)} days ago`;
}

function eventFill(marks: HolidayCalendarMark[]): string | null {
  const event = marks.find((m) => m.kind === "event");
  if (!event) return null;
  if (event.confirmed) return "bg-brand text-brand-foreground";
  if (event.id === "cyber_monday") return "bg-stone-300 text-foreground dark:bg-zinc-600 dark:text-zinc-100";
  return "bg-stone-200 text-foreground dark:bg-zinc-700 dark:text-zinc-100";
}

function deadlineDot(marks: HolidayCalendarMark[], today: string): string | null {
  const deadline = marks.find((m) => m.kind !== "event");
  if (!deadline) return null;
  const remaining = daysUntil(deadline.startDate, today);
  if (remaining < 0) return "bg-brand-red";
  if (remaining <= 7) return "bg-brand-yellow";
  return "bg-muted-foreground";
}

function MonthPane({
  year,
  month,
  today,
  selected,
  onSelect,
}: {
  year: number;
  month: number;
  today: string;
  selected: string;
  onSelect: (iso: string) => void;
}) {
  const cells = useMemo(() => monthGrid(year, month), [year, month]);
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {MONTH_NAMES[month - 1]} {year}
      </p>
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAY_HEADERS.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-[9px] font-bold uppercase text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {cells.map((cell, i) => {
          if (!cell.iso || cell.day == null) {
            return <div key={`empty-${i}`} className="h-8" />;
          }
          const marks = marksOnDate(cell.iso);
          const fill = eventFill(marks);
          const dot = deadlineDot(marks, today);
          const isToday = cell.iso === today;
          const isSelected = cell.iso === selected;
          const title = marks.length
            ? `${cell.iso}: ${marks.map((m) => m.label).join(", ")}`
            : cell.iso;
          return (
            <button
              key={cell.iso}
              type="button"
              title={title}
              onClick={() => onSelect(cell.iso!)}
              className={cn(
                "relative flex h-8 items-center justify-center rounded-md text-[11px] tabular-nums",
                fill ?? "text-foreground hover:bg-muted",
                isToday && !fill && "ring-1 ring-inset ring-brand",
                isToday && fill && "ring-1 ring-inset ring-brand-foreground/40",
                isSelected && "outline outline-1 outline-offset-1 outline-foreground/40",
                cell.iso < today && !fill && "text-muted-foreground",
              )}
            >
              {cell.day}
              {dot && (
                <span
                  className={cn(
                    "absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full",
                    dot,
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DeadlineCalendar({ today }: { today: string }) {
  const parsed = /^(\d{4})-(\d{2})/.exec(today);
  const startYear = parsed ? Number(parsed[1]) : 2026;
  const startMonth = parsed ? Number(parsed[2]) : 9;
  const [anchor, setAnchor] = useState<YearMonth>(() =>
    clampAnchor({ year: startYear, month: startMonth }),
  );
  const [selected, setSelected] = useState(today);

  const months = calendarWindow(anchor);

  const selectedMarks = marksOnDate(selected);
  const canPrev = compareYearMonth(anchor, CALENDAR_FIRST_ANCHOR) > 0;
  const canNext = compareYearMonth(anchor, CALENDAR_LAST_ANCHOR) < 0;

  return (
    <div className="rounded-[18px] border border-stone-200 bg-card p-5 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          Deal calendar
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!canPrev}
            aria-label="Previous months"
            className="inline-flex size-7 items-center justify-center rounded-full border border-stone-300 text-muted-foreground hover:bg-stone-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => setAnchor((a) => clampAnchor(shiftMonth(a.year, a.month, -1)))}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={!canNext}
            aria-label="Next months"
            className="inline-flex size-7 items-center justify-center rounded-full border border-stone-300 text-muted-foreground hover:bg-stone-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => setAnchor((a) => clampAnchor(shiftMonth(a.year, a.month, 1)))}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {months.map((pane) => (
          <MonthPane
            key={`${pane.year}-${pane.month}`}
            year={pane.year}
            month={pane.month}
            today={today}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
          {formatLong(selected)}
        </p>
        {selectedMarks.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No Amazon deadline on this day.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {selectedMarks.map((mark) => {
              const remaining = daysUntil(mark.startDate, today);
              return (
                <li key={mark.id} className="text-sm">
                  <span className="font-medium">{mark.label}</span>
                  {mark.confirmed && (
                    <span className="ml-1.5 text-[10px] font-bold uppercase text-brand">
                      Confirmed Oct 6-7
                    </span>
                  )}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {daysLabel(remaining)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold uppercase text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-brand" />
          Prime Days confirmed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-stone-200 dark:bg-zinc-700" />
          BF Week / Cyber Monday
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-brand-yellow" />
          Deadline
        </span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Fees: $100 upfront per promotion + 1.5% of promotional sales (capped at $5,000).
        Early-bird $50 off closed Aug 5 (Prime Day) / Sep 5 (BFCM). Peak fulfillment
        ~$0.32/unit + 3.5% fuel surcharge Oct 15 2026 through Jan 14 2027.
      </p>
    </div>
  );
}
