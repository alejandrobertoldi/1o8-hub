import type { MonthlyPeriod } from "./types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function lastDayOfMonth(year: number, monthIdx0: number): number {
  // Date(Y, monthIdx+1, 0) gives the last day of monthIdx.
  return new Date(year, monthIdx0 + 1, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function resolvePeriod(period: string): MonthlyPeriod {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Invalid period '${period}' (expected YYYY-MM)`);
  const year = Number(m[1]);
  const month = Number(m[2]); // 1..12
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in '${period}'`);
  }

  const monthIdx = month - 1;
  const start = `${year}-${pad2(month)}-01`;
  const end = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, monthIdx))}`;

  const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1;
  const prevYear = monthIdx === 0 ? year - 1 : year;
  const prevStart = `${prevYear}-${pad2(prevMonthIdx + 1)}-01`;
  const prevEnd = `${prevYear}-${pad2(prevMonthIdx + 1)}-${pad2(lastDayOfMonth(prevYear, prevMonthIdx))}`;

  return {
    period,
    start,
    end,
    prevStart,
    prevEnd,
    label: `${MONTH_NAMES[monthIdx]} ${year}`,
  };
}

/**
 * Amazon / Intentwise settlement lags 3–4 days after month-end.
 * Reports for the previous calendar month become eligible on the 4th.
 */
export function lastCompletedMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const day = now.getUTCDate();
  // days 1–3: don't trust last month yet — go back 2 months
  // day 4+: last month is the generate window
  const offset = day <= 3 ? 2 : 1;
  const targetDate = new Date(Date.UTC(y, m - offset, 1));
  return `${targetDate.getUTCFullYear()}-${pad2(targetDate.getUTCMonth() + 1)}`;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")      // strip accents
    .replace(/['']/g, "")                 // drop apostrophes so "Trejo's" → "trejos"
    .replace(/[^a-z0-9]+/g, "-")          // non-alphanum → hyphen
    .replace(/^-+|-+$/g, "");             // trim leading/trailing hyphens
}
