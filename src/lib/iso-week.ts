/**
 * ISO-week helpers — the SINGLE SOURCE OF TRUTH for sales-summary week math.
 *
 * Why this file exists: the sales-summary frontend (src/app/sales-summary/page.tsx
 * and src/app/portal/sales/overview/page.tsx) computes its default view as the
 * PREVIOUS ISO week via getSundayOfWeek(). The refresh-sales cron used to compute
 * Sunday–Saturday weeks off `now.getDay()` instead — the two definitions drifted
 * apart every Sunday, so the cron never pre-warmed the week the frontend was
 * actually showing → cache miss → live 30–120s Redshift query → stuck spinner.
 *
 * getWeekNumber / getSundayOfWeek / formatDate below are byte-for-byte copies of
 * the frontend implementations. If you change the frontend's week math, change it
 * here too (and migrate the pages to import from here).
 */

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeekNumber(d: Date | string): number {
  // Parse YYYY-MM-DD strings as local dates to avoid timezone shifts
  let year: number, month: number, day: number;
  if (typeof d === "string") {
    const [y, m, dd] = d.split("-").map(Number);
    year = y;
    month = m - 1;
    day = dd;
  } else {
    year = d.getFullYear();
    month = d.getMonth();
    day = d.getDate();
  }
  const date = new Date(Date.UTC(year, month, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getSundayOfWeek(year: number, week: number): Date {
  // ISO week: week 1 contains Jan 4th
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7; // Mon=1..Sun=7
  const mondayW1 = new Date(year, 0, 4 - jan4Day + 1);
  const monday = new Date(mondayW1);
  monday.setDate(mondayW1.getDate() + (week - 1) * 7);
  // Shift back 1 day: Sunday is start of week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() - 1);
  return sunday;
}

export interface WeekRange {
  start: string; // YYYY-MM-DD (Sunday)
  end: string; // YYYY-MM-DD (Saturday)
}

function rangeFromSunday(sunday: Date): WeekRange {
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: formatDate(sunday), end: formatDate(saturday) };
}

/**
 * The week range the sales-summary pages show BY DEFAULT.
 * Mirrors the frontend exactly: selectedWeek = currentWeek > 1 ? currentWeek - 1 : currentWeek.
 */
export function defaultWeekRange(now: Date): WeekRange {
  const currentWeek = getWeekNumber(formatDate(now));
  const currentYear = now.getFullYear();
  const selectedWeek = currentWeek > 1 ? currentWeek - 1 : currentWeek;
  return rangeFromSunday(getSundayOfWeek(currentYear, selectedWeek));
}

/**
 * The `count` most-recent ISO week ranges, newest first:
 * index 0 = current ISO week, 1 = previous (the frontend default), 2 = the one before, ...
 *
 * Anchored on the current ISO week's Sunday and stepped back 7 days at a time, so
 * year boundaries are handled by date arithmetic rather than week-number math.
 * Pre-warming indices 0..1 always covers the frontend default (it is index 1 when
 * currentWeek > 1, and index 0 when currentWeek === 1).
 */
export function recentWeekRanges(now: Date, count: number): WeekRange[] {
  const currentWeek = getWeekNumber(formatDate(now));
  const currentYear = now.getFullYear();
  const anchorSunday = getSundayOfWeek(currentYear, currentWeek);
  const ranges: WeekRange[] = [];
  for (let i = 0; i < count; i++) {
    const sunday = new Date(anchorSunday);
    sunday.setDate(anchorSunday.getDate() - 7 * i);
    ranges.push(rangeFromSunday(sunday));
  }
  return ranges;
}
