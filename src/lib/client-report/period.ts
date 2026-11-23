/**
 * Report periods are calendar months, "YYYY-MM". Pure; unit-tested.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const isPeriod = (p: unknown): p is string => typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** "2026-10" shifted by n months ("2026-10", -1 → "2026-09"). */
export function shiftPeriod(period: string, n: number): string {
  const [y, m] = period.split("-").map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

export const daysInPeriod = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** First and last day ("YYYY-MM-DD") of the month. */
export function periodRange(period: string): { start: string; end: string } {
  return { start: `${period}-01`, end: `${period}-${String(daysInPeriod(period)).padStart(2, "0")}` };
}

/** "2026-10" → "October 2026". */
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "2026-10" → "Oct 2025"-style short label for charts. */
export function periodShortLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

/** The last fully finished month on `today` ("YYYY-MM-DD"). */
export function lastCompletedPeriod(today: string): string {
  return shiftPeriod(today.slice(0, 7), -1);
}

/** The `count` months ending with `period`, oldest first. */
export function trailingPeriods(period: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftPeriod(period, i - count + 1));
}
