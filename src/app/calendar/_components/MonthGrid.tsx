"use client";

import { Plus } from "lucide-react";
import { getISOWeek } from "date-fns";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type CalendarEvent,
  type CalendarFilterKey,
  type EventType,
  EVENT_STYLES,
  DAY_HEADERS,
  formatDateKey,
  getDaysInMonth,
  getFirstDayOfWeek,
  toLocalDateParts,
  dateRangeRole,
  eventCoversDate,
} from "./types";
import { EventPopoverForm } from "./EventPopover";
import { ApprovedTimeOffOverlay } from "./ApprovedTimeOffOverlay";
import { HolidayOverlay, type HolidayRow } from "./HolidayOverlay";
import type { ApprovedRow } from "@/lib/time-off/queries";

/** ISO week label for the Monday that opens a Mon–Sun row. */
function weekLabelForMonday(dateKey: string): string {
  const { year, month, day } = toLocalDateParts(dateKey);
  return `W${String(getISOWeek(new Date(year, month, day))).padStart(2, "0")}`;
}

interface MonthGridProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  approvedTimeOff: ApprovedRow[];
  holidays: HolidayRow[];
  activeFilters: Set<CalendarFilterKey>;
  activePopover:
    | { kind: "create"; dateKey: string }
    | { kind: "edit"; eventId: string; cellKey: string }
    | null;
  onPopoverChange: (
    next:
      | { kind: "create"; dateKey: string }
      | { kind: "edit"; eventId: string; cellKey: string }
      | null
  ) => void;
  onSaveEdit: (
    id: string,
    data: {
      title: string;
      startDate: string;
      endDate: string;
      type: EventType;
      memberName: string | null;
      description: string | null;
    }
  ) => Promise<void>;
  onCreate: (data: {
    title: string;
    startDate: string;
    endDate: string;
    type: EventType;
    memberName: string | null;
    description: string | null;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  busyId: string | null;
}

const MAX_CHIPS_PER_CELL = 3;

export function MonthGrid({
  year,
  month,
  events,
  approvedTimeOff,
  holidays,
  activeFilters,
  activePopover,
  onPopoverChange,
  onSaveEdit,
  onCreate,
  onDelete,
  busyId,
}: MonthGridProps) {
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const filteredEvents = events.filter((e) => activeFilters.has(e.type));
  const showPublicHolidays = activeFilters.has("publicHoliday");

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  type Cell = {
    key: string;
    day: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    isWeekend: boolean;
  };

  const cells: Cell[] = [];

  // Week columns: Mon=0 … Sun=6. Sat/Sun are the last two columns.
  const isWeekendCol = (idx: number) => idx % 7 === 5 || idx % 7 === 6;

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const key = formatDateKey(prevYear, prevMonth, d);
    const idx = firstDayOfWeek - 1 - i;
    cells.push({
      key,
      day: d,
      isCurrentMonth: false,
      isToday: key === todayKey,
      isWeekend: isWeekendCol(idx),
    });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = formatDateKey(year, month, d);
    const idx = cells.length;
    cells.push({
      key,
      day: d,
      isCurrentMonth: true,
      isToday: key === todayKey,
      isWeekend: isWeekendCol(idx),
    });
  }

  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const key = formatDateKey(nextYear, nextMonth, d);
    const idx = cells.length;
    cells.push({
      key,
      day: d,
      isCurrentMonth: false,
      isToday: key === todayKey,
      isWeekend: isWeekendCol(idx),
    });
  }

  // Per-cell event lookup
  const eventsByCell: Record<string, CalendarEvent[]> = {};
  for (const cell of cells) {
    eventsByCell[cell.key] = filteredEvents
      .filter((e) => eventCoversDate(e, cell.key))
      .sort((a, b) => {
        // Multi-day before single-day, then by start
        const aSpan = a.endDate > a.startDate;
        const bSpan = b.endDate > b.startDate;
        if (aSpan !== bSpan) return aSpan ? -1 : 1;
        return a.startDate.localeCompare(b.startDate);
      });
  }

  // Six Mon–Sun rows; week number is taken from each row's Monday.
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return (
    <div className="rounded-xl glass-card border border-neutral-300 dark:border-white/10 overflow-hidden animate-card-enter">
      <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] border-b border-border/40">
        <div
          className="py-3 text-center text-[10px] font-bold text-muted-foreground/70 uppercase tracking-[0.15em]"
          aria-label="Week"
        >
          W
        </div>
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="py-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))]">
        {weeks.flatMap((week, weekIndex) => {
          const monday = week[0];
          const label = weekLabelForMonday(monday.key);
          const weekHeader = (
            <div
              key={`week-${monday.key}`}
              className="relative flex items-start justify-center min-h-[100px] lg:min-h-[120px] border-b border-r border-border/50 bg-muted/20 px-0.5 pt-1.5 lg:pt-2"
              aria-label={`Week ${label.slice(1)}`}
            >
              <span className="text-[10px] font-bold tabular-nums tracking-wider text-muted-foreground">
                {label}
              </span>
            </div>
          );

          const dayCells = week.map((cell, weekIdx) => {
          const idx = weekIndex * 7 + weekIdx;
          const cellEvents = eventsByCell[cell.key] ?? [];
          const isCreateOpen =
            activePopover?.kind === "create" && activePopover.dateKey === cell.key;

          const visible = cellEvents.slice(0, MAX_CHIPS_PER_CELL);
          const overflow = cellEvents.length - visible.length;

          return (
            <div
              key={cell.key + "-" + idx}
              className={`
                relative flex flex-col min-h-[100px] lg:min-h-[120px] border-b border-r border-border/50
                ${cell.isCurrentMonth ? "" : "opacity-40"}
                ${cell.isToday ? "bg-brand/[0.04]" : ""}
                ${cell.isWeekend && cell.isCurrentMonth ? "bg-muted/15" : ""}
              `}
            >
              {/* Empty-area create trigger — behind day number + chips */}
              <Popover
                open={isCreateOpen && cell.isCurrentMonth}
                onOpenChange={(o) => {
                  if (!o) onPopoverChange(null);
                  else if (cell.isCurrentMonth)
                    onPopoverChange({ kind: "create", dateKey: cell.key });
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    disabled={!cell.isCurrentMonth}
                    className={`
                      absolute inset-0 z-0
                      ${cell.isCurrentMonth ? "cursor-pointer hover:bg-muted/30 transition-colors" : "cursor-default"}
                    `}
                    aria-label={`Add event on ${cell.key}`}
                  >
                    {cell.isCurrentMonth && cellEvents.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                        <Plus className="size-5 text-muted-foreground/30" />
                      </div>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="p-4 w-auto"
                  onInteractOutside={(e) => {
                    const target = (e as CustomEvent).detail?.originalEvent?.target as Element | null;
                    if (target?.closest?.('[data-slot="popover-content"]')) e.preventDefault();
                  }}
                >
                  <EventPopoverForm
                    initial={{ startDate: cell.key, endDate: cell.key }}
                    onSave={async (data) => {
                      await onCreate(data);
                    }}
                    onCancel={() => onPopoverChange(null)}
                    saving={busyId === "creating"}
                  />
                </PopoverContent>
              </Popover>

              {/* Day number — own top row in flow so chips cannot overlap it */}
              <div className="relative z-20 flex items-start justify-start px-1.5 pt-1.5 pb-1 lg:px-2 lg:pt-2 pointer-events-none">
                <span
                  className={`
                    inline-flex items-center justify-center text-base lg:text-lg font-bold tabular-nums leading-none
                    ${cell.isToday
                      ? "size-8 rounded-full bg-brand-solid text-white"
                      : cell.isCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground/40"
                    }
                  `}
                >
                  {cell.day}
                </span>
              </div>

              {/* Event chips below the day number */}
              <div className="relative z-10 flex-1 px-1 lg:px-1.5 pb-1 space-y-0.5 pointer-events-none">
                {visible.map((ev) => {
                  const role = dateRangeRole(ev, cell.key);
                  const isEditOpen =
                    activePopover?.kind === "edit" &&
                    activePopover.eventId === ev.id &&
                    activePopover.cellKey === cell.key;
                  const s = EVENT_STYLES[ev.type];
                  const Icon = s.icon;

                  // Continuation bar (middle/end): thin colored bar, no text
                  if (role === "middle" || role === "end") {
                    return (
                      <Popover
                        key={ev.id + "-" + cell.key}
                        open={isEditOpen}
                        onOpenChange={(o) => {
                          if (!o) onPopoverChange(null);
                          else onPopoverChange({ kind: "edit", eventId: ev.id, cellKey: cell.key });
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className={`
                              pointer-events-auto w-full h-3 ${s.bar}
                              ${role === "middle" ? "" : "rounded-r-md"}
                              hover:brightness-110 transition cursor-pointer
                            `}
                            aria-label={`${ev.title} (continues)`}
                          />
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="p-4 w-auto"
                          onInteractOutside={(e) => {
                            const target = (e as CustomEvent).detail?.originalEvent?.target as Element | null;
                            if (target?.closest?.('[data-slot="popover-content"]')) e.preventDefault();
                          }}
                        >
                          <EventPopoverForm
                            initial={ev}
                            onSave={async (data) => {
                              await onSaveEdit(ev.id, data);
                            }}
                            onCancel={() => onPopoverChange(null)}
                            onDelete={async () => {
                              await onDelete(ev.id);
                            }}
                            saving={busyId === ev.id}
                            deleting={busyId === ev.id}
                          />
                        </PopoverContent>
                      </Popover>
                    );
                  }

                  // Start or single: full chip with title
                  const isStart = role === "start";
                  return (
                    <Popover
                      key={ev.id + "-" + cell.key}
                      open={isEditOpen}
                      onOpenChange={(o) => {
                        if (!o) onPopoverChange(null);
                        else onPopoverChange({ kind: "edit", eventId: ev.id, cellKey: cell.key });
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className={`
                            pointer-events-auto flex items-start gap-1.5 px-2 py-1
                            text-[11px] font-medium border w-full text-left
                            ${s.bg} ${s.text} ${s.border}
                            ${isStart ? "rounded-l-md" : "rounded-md"}
                            transition-all hover:brightness-110 cursor-pointer
                          `}
                        >
                          <Icon className="mt-0.5 size-3 shrink-0" />
                          <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                            {ev.title}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="p-4 w-auto"
                        onInteractOutside={(e) => {
                          const target = (e as CustomEvent).detail?.originalEvent?.target as Element | null;
                          if (target?.closest?.('[data-slot="popover-content"]')) e.preventDefault();
                        }}
                      >
                        <EventPopoverForm
                          initial={ev}
                          onSave={async (data) => {
                            await onSaveEdit(ev.id, data);
                          }}
                          onCancel={() => onPopoverChange(null)}
                          onDelete={async () => {
                            await onDelete(ev.id);
                          }}
                          saving={busyId === ev.id}
                          deleting={busyId === ev.id}
                        />
                      </PopoverContent>
                    </Popover>
                  );
                })}
                {overflow > 0 && (
                  <span className="block text-[10px] text-muted-foreground font-medium pl-1 pointer-events-none">
                    +{overflow} more
                  </span>
                )}
                {activeFilters.has("pto") ? (
                  <ApprovedTimeOffOverlay rows={approvedTimeOff} cellKey={cell.key} />
                ) : null}
                {showPublicHolidays ? (
                  <HolidayOverlay rows={holidays} cellKey={cell.key} />
                ) : null}
              </div>
            </div>
          );
          });

          return [weekHeader, ...dayCells];
        })}
      </div>
    </div>
  );
}
