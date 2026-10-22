"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  trailingRange,
  sumHoursByDay,
  buildCalendarWeeks,
  weekTotals,
  isoWeekNumber,
  fmtHM,
  formatDayLabel,
  trafficLight,
  trafficLightFill,
  trafficLightText,
  overtimeBorderClass,
} from "@/lib/hours/dashboard-utils";

const CARD = "light-surface rounded-xl border border-stone-200 bg-card p-4";

/** Today as local YYYY-MM-DD. */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTH_OPTIONS = [
  { months: 3, label: "3mo" },
  { months: 6, label: "6mo" },
  { months: 12, label: "12mo" },
] as const;

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * One day cell: 2.75rem wide x 2.5rem tall. Taller than the admin Member x client
 * heatmap's 2rem because each cell stacks a day-of-month number above its hours.
 * The weekday gutter below MUST use the same height or every label slides out of
 * register with its row.
 */
const CELL = "h-10 w-11 shrink-0";

/**
 * Week-total footer wrapper. Shared by the gutter and every column on purpose:
 * row alignment is structural (see the gutter's spacer comment), so the two stacks
 * must grow by exactly the same height. A shared constant makes drift impossible.
 */
const FOOTER_ROW = "mt-1 border-t border-stone-200 pt-1";

type HoursEntry = { entryDate: string; hours: number };

export function HoursHeatmapCalendar({
  selectedDate,
  onSelectDay,
}: {
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
}) {
  const [months, setMonths] = useState<3 | 6 | 12>(3);
  const range = useMemo(() => trailingRange(todayIso(), months), [months]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["hours", range.from, range.to],
    queryFn: async () => {
      const res = await fetch(`/api/hours?from=${range.from}&to=${range.to}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load hours");
      return (await res.json()).entries as HoursEntry[];
    },
  });

  const byDay = useMemo(() => sumHoursByDay(data ?? []), [data]);
  const { weeks, monthLabels, yearLabels } = useMemo(
    () => buildCalendarWeeks(range.from, range.to),
    [range.from, range.to],
  );
  const windowTotal = useMemo(() => {
    let sum = 0;
    for (const v of byDay.values()) sum += v;
    return sum;
  }, [byDay]);
  const totals = useMemo(() => weekTotals(weeks, byDay), [weeks, byDay]);

  const monthLabelAt = (index: number) => monthLabels.find((m) => m.index === index)?.label ?? "";
  /** Year for column `index`: the latest yearLabel at or before this column. */
  const yearAt = (index: number) => {
    let label = "";
    for (const y of yearLabels) {
      if (y.index <= index) label = y.label;
      else break;
    }
    return label;
  };
  const activeLabel = MONTH_OPTIONS.find((o) => o.months === months)!.label;

  return (
    <div className={CARD}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-medium">Your hours</div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-stone-200 p-0.5 text-xs">
            {MONTH_OPTIONS.map((o) => (
              <Button
                key={o.months}
                type="button"
                variant={months === o.months ? "default" : "ghost"}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setMonths(o.months)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          {!isLoading && !error && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {fmtHM(windowTotal)} in last {activeLabel}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : "Failed to load hours"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex">
            {/* Weekday gutter. The three spacers mirror the columns' year + month + week
                header rows exactly, so row alignment is structural, not incidental. */}
            <div className="mr-2 flex shrink-0 flex-col">
              <div className="h-3" />
              <div className="mt-1 h-3" />
              <div className="mt-1 h-3" />
              <div className="mt-1 flex flex-col gap-[3px]">
                {WEEKDAY_LABELS.map((d) => (
                  <div
                    key={d}
                    className="flex h-10 items-center text-[9px] leading-none text-muted-foreground"
                  >
                    {d}
                  </div>
                ))}
              </div>
              {/* Week-total footer. Shares FOOTER_ROW and the h-4 height with the
                  columns' footer, or every weekday label above slides out of
                  register with its row. */}
              <div className={FOOTER_ROW}>
                <div className="flex h-4 items-center text-[9px] leading-none text-muted-foreground">
                  Total
                </div>
              </div>
            </div>

            {weeks.map((week, wi) => {
              const monthLabel = monthLabelAt(wi);
              const startsMonth = wi > 0 && monthLabel !== "";
              const showYear = wi === 0 || startsMonth;
              const firstReal = week.find((c) => c !== "");
              const total = totals[wi];
              return (
                <div
                  key={wi}
                  className={`flex shrink-0 flex-col ${
                    wi === 0
                      ? ""
                      : startsMonth
                        ? "ml-2 border-l border-stone-200 pl-2"
                        : "ml-[3px]"
                  }`}
                >
                  <div className="h-3 whitespace-nowrap text-[9px] font-semibold leading-none text-foreground">
                    {showYear ? yearAt(wi) : ""}
                  </div>
                  <div className="mt-1 h-3 whitespace-nowrap text-[9px] font-semibold leading-none text-foreground">
                    {monthLabel}
                  </div>
                  <div className="mt-1 h-3 text-[9px] leading-none tabular-nums text-muted-foreground">
                    {firstReal ? `W${String(isoWeekNumber(firstReal)).padStart(2, "0")}` : ""}
                  </div>
                  <div className="mt-1 flex flex-col gap-[3px]">
                    {week.map((date, di) => {
                      if (!date) return <div key={di} className={CELL} />;
                      const hours = byDay.get(date) ?? 0;
                      const signal = trafficLight(hours);
                      const isSelected = date === selectedDate;
                      const overtime = signal === "over";
                      return (
                        <button
                          key={di}
                          type="button"
                          title={`${formatDayLabel(date)}: ${fmtHM(hours)}${overtime ? " · Overtime" : ""}`}
                          aria-label={`${formatDayLabel(date)}: ${fmtHM(hours)}${overtime ? " · Overtime" : ""}`}
                          onClick={() => onSelectDay(date)}
                          className={`${CELL} flex flex-col justify-between rounded-sm px-1 py-[3px] text-[9px] font-medium tabular-nums transition-colors hover:ring-1 hover:ring-brand ${overtimeBorderClass(
                            hours,
                          )} ${trafficLightText(hours)} ${isSelected ? "ring-2 ring-brand" : ""}`}
                          style={{ backgroundColor: trafficLightFill(hours) }}
                        >
                          {/* Day-of-month, sliced off the ISO string rather than parsed
                              via Date - no timezone can shift it off by a day. */}
                          <span className="self-start text-[8px] font-normal leading-none opacity-60">
                            {Number(date.slice(8))}
                          </span>
                          <span className="self-center leading-none">
                            {signal !== "empty" ? fmtHM(hours) : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className={FOOTER_ROW}>
                    <div className="flex h-4 w-11 items-center justify-center whitespace-nowrap text-[9px] font-semibold leading-none tabular-nums text-foreground">
                      {total > 0 ? fmtHM(total) : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend — scaled yellow / solid green / scaled red */}
          <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              {[1, 3, 5, 7].map((h) => (
                <span
                  key={h}
                  className="h-3 w-3 rounded-sm border border-stone-200"
                  style={{ backgroundColor: trafficLightFill(h) }}
                />
              ))}
            </span>
            <span>≤7:59</span>
            <span
              className="ml-2 h-3 w-3 rounded-sm border border-stone-200"
              style={{ backgroundColor: trafficLightFill(8) }}
            />
            <span>8:00</span>
            <span className="ml-2 flex items-center gap-0.5">
              {[9, 13, 17, 21].map((h) => (
                <span
                  key={h}
                  className="h-3 w-3 rounded-sm border border-stone-200"
                  style={{ backgroundColor: trafficLightFill(h) }}
                />
              ))}
            </span>
            <span>8:01+</span>
          </div>
        </div>
      )}
    </div>
  );
}
