import { TIME_SETTINGS } from "./catalog";

/**
 * The hours flag on My Dashboard: today so far, the last workday, this week
 * against 8 h × workdays so far, and the recent workdays under the minimum.
 * Today never counts as short (the day isn't over). Pure; unit-tested.
 */

const DAY = 86_400_000;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
const isWeekdayDate = (d: string) => weekday(d) !== 0 && weekday(d) !== 6;

export type HoursFlag = {
  today: number;
  /** The last workday before today (and on or after hour logging went live), with its hours. */
  lastWorkday: { date: string; hours: number } | null;
  week: { logged: number; expected: number };
  /** Workdays in the window (before today) with less than the daily minimum. */
  shortDays: { date: string; hours: number }[];
};

export function hoursFlag(
  logs: { entryDate: string; hours: string | number }[],
  today: string,
  {
    windowDays = 14,
    min = TIME_SETTINGS.dailyMinimumHours,
    start = TIME_SETTINGS.trackingStartDate,
    holidays = new Set<string>(),
  }: { windowDays?: number; min?: number; start?: string; holidays?: ReadonlySet<string> } = {},
): HoursFlag {
  // Holidays on the person's calendar aren't workdays.
  const isWorkday = (d: string) => isWeekdayDate(d) && !holidays.has(d);
  const byDay = new Map<string, number>();
  for (const l of logs) byDay.set(l.entryDate, (byDay.get(l.entryDate) ?? 0) + Number(l.hours));
  const on = (d: string) => Math.round((byDay.get(d) ?? 0) * 100) / 100;

  let lastWorkday: HoursFlag["lastWorkday"] = null;
  for (let d = addDays(today, -1); d >= start && d >= addDays(today, -windowDays); d = addDays(d, -1)) {
    if (isWorkday(d)) {
      lastWorkday = { date: d, hours: on(d) };
      break;
    }
  }

  const shortDays: HoursFlag["shortDays"] = [];
  for (let d = addDays(today, -1); d >= addDays(today, -windowDays) && d >= start; d = addDays(d, -1)) {
    if (isWorkday(d) && on(d) < min) shortDays.push({ date: d, hours: on(d) });
  }

  // Monday of this week through today; expected only counts workdays already finished.
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  let logged = 0;
  let expected = 0;
  for (let d = monday; d <= today; d = addDays(d, 1)) {
    logged += on(d);
    if (d < today && d >= start && isWorkday(d)) expected += min;
  }

  return { today: on(today), lastWorkday, week: { logged: Math.round(logged * 100) / 100, expected }, shortDays };
}
