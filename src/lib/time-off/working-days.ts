/**
 * Pure date arithmetic for the team time-off feature.
 *
 * Everything here operates on `YYYY-MM-DD` strings, matching the convention
 * already used by `calendar_events` and the existing calendar components.
 * There is deliberately no database access, no `Date.now()`, and no local
 * timezone involvement: all internal Date objects are constructed in UTC so
 * that a day never shifts under a server in a different zone.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a `YYYY-MM-DD` string naming a real calendar day. */
export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  // Round-trip guard: rejects 2026-02-30, 2026-13-01, etc.
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/** Throws a message naming `label` unless `value` is a valid date string. */
export function assertDateString(
  value: unknown,
  label: string
): asserts value is string {
  if (!isDateString(value)) {
    throw new Error(`${label} must be a valid date in YYYY-MM-DD format`);
  }
}

function toUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Inclusive count of working days between two dates.
 *
 * Excludes Saturdays, Sundays, and any date present in `holidays`. A holiday
 * landing on a weekend is already excluded by the weekend rule and is never
 * subtracted twice.
 *
 * `holidays` holds `YYYY-MM-DD` strings for ONE country — resolving which
 * country is the caller's job, so this function stays country-agnostic. Pass
 * an empty set for a user with no country assigned.
 */
export function countWorkingDays(
  startDate: string,
  endDate: string,
  holidays: Set<string>
): number {
  assertDateString(startDate, "startDate");
  assertDateString(endDate, "endDate");
  if (endDate < startDate) {
    throw new Error("endDate must be on or after startDate");
  }

  const last = toUtcDate(endDate);
  let cursor = toUtcDate(startDate);
  let count = 0;

  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const key = toKey(cursor);
    if (day !== 0 && day !== 6 && !holidays.has(key)) count++;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }

  return count;
}

/**
 * True when two inclusive date ranges share at least one day.
 *
 * Lexicographic comparison is valid here because `YYYY-MM-DD` sorts
 * identically to chronological order.
 */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  assertDateString(aStart, "aStart");
  assertDateString(aEnd, "aEnd");
  assertDateString(bStart, "bStart");
  assertDateString(bEnd, "bEnd");
  return aStart <= bEnd && bStart <= aEnd;
}
