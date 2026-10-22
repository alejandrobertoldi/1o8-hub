const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

/** String math only — dates never cross module boundaries as Date. */
export function monthRange(m: string): { start: string; endExclusive: string } {
  const [y, mo] = m.split("-").map(Number);
  const ny = mo === 12 ? y + 1 : y;
  const nm = mo === 12 ? 1 : mo + 1;
  return { start: `${m}-01`, endExclusive: `${ny}-${String(nm).padStart(2, "0")}-01` };
}

/** Last calendar day of a 'YYYY-MM' month, as 'YYYY-MM-DD'. */
export function monthLastDay(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate(); // Date stays internal; a string leaves.
  return `${m}-${String(days).padStart(2, "0")}`;
}

/** Months (any order) overlapping start..end (YYYY-MM-DD, inclusive), newest first. */
export function monthsOverlapping(months: string[], start: string, end: string): string[] {
  return months.filter((m) => `${m}-01` <= end && monthLastDay(m) >= start).sort().reverse();
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-08" → "Aug 2026". */
export function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MON[Number(mm) - 1]} ${y}`;
}
