import { Gift, Flag, Clock, Star, Sparkles, Plane } from "lucide-react";

export type EventType = "holiday" | "deadline" | "content" | "milestone" | "pto";

/** Header/legend filter keys. `publicHoliday` is the read-only country-holiday
 * overlay (not an editable `calendar_events` type — those stay `holiday` /
 * Observance per D12). */
export type CalendarFilterKey = EventType | "publicHoliday";

export interface CalendarEvent {
  id: string;
  legacyId: string | null;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD (>= startDate)
  type: EventType;
  memberName: string | null;
  description: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type ChipStyle = {
  bg: string;
  text: string;
  border: string;
  bar: string;
  icon: typeof Gift;
  label: string;
};

export const EVENT_STYLES: Record<EventType, ChipStyle> = {
  holiday: {
    bg: "bg-amber-500/12",
    text: "text-amber-500",
    border: "border-amber-500/25",
    bar: "bg-amber-500/30",
    icon: Gift,
    label: "Observance",
  },
  deadline: {
    bg: "bg-red-500/12",
    text: "text-red-400",
    border: "border-red-500/25",
    bar: "bg-red-500/30",
    icon: Clock,
    label: "Deadline",
  },
  content: {
    bg: "bg-emerald-500/12",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    bar: "bg-emerald-500/30",
    icon: Sparkles,
    label: "Content",
  },
  milestone: {
    bg: "bg-brand/12",
    text: "text-brand",
    border: "border-brand/25",
    bar: "bg-brand/30",
    icon: Star,
    label: "Milestone",
  },
  pto: {
    bg: "bg-violet-500/12",
    text: "text-violet-400",
    border: "border-violet-500/25",
    bar: "bg-violet-500/30",
    icon: Plane,
    label: "PTO / OOO",
  },
};

/** Public-holiday overlay chrome — deep blue so it stays clear of Content
 * emerald, Observance amber, Deadline red, Milestone brand, and PTO violet. */
export const PUBLIC_HOLIDAY_STYLE: ChipStyle = {
  bg: "bg-blue-800/15",
  text: "text-blue-800 dark:text-blue-300",
  border: "border-blue-800/30",
  bar: "bg-blue-800/35",
  icon: Flag,
  label: "Holiday",
};

/** Header filter pills + legend order. Holiday leads; Observance follows. */
export const FILTER_CHIPS: { key: CalendarFilterKey; style: ChipStyle }[] = [
  { key: "publicHoliday", style: PUBLIC_HOLIDAY_STYLE },
  { key: "holiday", style: EVENT_STYLES.holiday },
  { key: "deadline", style: EVENT_STYLES.deadline },
  { key: "content", style: EVENT_STYLES.content },
  { key: "milestone", style: EVENT_STYLES.milestone },
  { key: "pto", style: EVENT_STYLES.pto },
];

export const DEFAULT_FILTERS: CalendarFilterKey[] = FILTER_CHIPS.map((c) => c.key);

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function toLocalDateParts(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m - 1, day: d };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Column index of the 1st (0 = Monday … 6 = Sunday). Converts JS `getDay()`
 * (0 = Sunday) so the month grid can start weeks on Monday.
 */
export function getFirstDayOfWeek(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

/**
 * Inclusive [gridStart, gridEnd] date range of the 42 cells MonthGrid renders
 * for `year`/`month`, including the leading days borrowed from the previous
 * month and the trailing days from the next. Up to 18 visible cells fall
 * outside the month itself, so anything fetched only for [1st, last] leaves
 * those cells silently blank. Mirrors the cell-building loops in MonthGrid.tsx
 * (the source of truth) — keep the two in sync. Weeks start Monday.
 */
export function getGridWindow(
  year: number,
  month: number
): { gridStart: string; gridEnd: string } {
  const firstDayOfWeek = getFirstDayOfWeek(year, month);
  const daysInMonth = getDaysInMonth(year, month);

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const gridStart =
    firstDayOfWeek === 0
      ? formatDateKey(year, month, 1)
      : formatDateKey(
          prevYear,
          prevMonth,
          getDaysInMonth(prevYear, prevMonth) - firstDayOfWeek + 1
        );

  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const gridEnd = formatDateKey(nextYear, nextMonth, 42 - firstDayOfWeek - daysInMonth);

  return { gridStart, gridEnd };
}

export function eventCoversDate(ev: CalendarEvent, dateKey: string): boolean {
  return ev.startDate <= dateKey && dateKey <= ev.endDate;
}

export function dateRangeRole(
  ev: CalendarEvent,
  dateKey: string
): "single" | "start" | "middle" | "end" {
  if (ev.startDate === ev.endDate) return "single";
  if (dateKey === ev.startDate) return "start";
  if (dateKey === ev.endDate) return "end";
  return "middle";
}

export { Gift, Flag, Clock, Star, Sparkles, Plane };
