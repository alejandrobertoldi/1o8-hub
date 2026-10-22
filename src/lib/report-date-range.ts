export type RangeMode = "week" | "custom";
export type RangeOpts = { customStart: string; customEnd: string; year: number; week: number };

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getFirstDayOfCurrentMonth(now: Date): string {
  return formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function getWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getSundayOfWeek(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const mondayW1 = new Date(year, 0, 4 - jan4Day + 1);
  const monday = new Date(mondayW1);
  monday.setDate(mondayW1.getDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() - 1);
  return sunday;
}

export function resolveRange(mode: RangeMode, opts: RangeOpts): { start: string; end: string } {
  if (mode === "week") {
    const weekStart = formatDate(getSundayOfWeek(opts.year, opts.week));
    const startDate = new Date(weekStart + "T00:00:00");
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    return { start: weekStart, end: formatDate(endDate) };
  }
  return { start: opts.customStart, end: opts.customEnd };
}
