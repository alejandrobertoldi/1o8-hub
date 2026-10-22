/**
 * Shared date-range utilities used by sales-summary and PPC modules.
 */

export type TimePeriod = "1D" | "7D" | "1M" | "3M" | "6M" | "1Y";

export function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getISOWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getMondayOfISOWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const mondayW1 = new Date(year, 0, 4 - jan4Day + 1);
  const monday = new Date(mondayW1);
  monday.setDate(mondayW1.getDate() + (week - 1) * 7);
  return monday;
}

export function getDateRange(period: TimePeriod): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case "1D": start.setDate(end.getDate() - 1); break;
    case "7D": start.setDate(end.getDate() - 7); break;
    case "1M": start.setMonth(end.getMonth() - 1); break;
    case "3M": start.setMonth(end.getMonth() - 3); break;
    case "6M": start.setMonth(end.getMonth() - 6); break;
    case "1Y": start.setFullYear(end.getFullYear() - 1); break;
  }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function getPreviousRange(start: string, end: string): { prevStart: string; prevEnd: string } {
  const s = new Date(start);
  const e = new Date(end);
  const diffMs = e.getTime() - s.getTime();
  const prevEnd = new Date(s.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - diffMs);
  return { prevStart: prevStart.toISOString().slice(0, 10), prevEnd: prevEnd.toISOString().slice(0, 10) };
}
