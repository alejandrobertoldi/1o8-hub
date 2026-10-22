// Per-client inventory recommendation settings: validation + date windows.
// Seasonal dates end up inside Redshift SQL text, so isIsoDate is a SECURITY
// boundary, not just input hygiene — keep it strict.

export type RecMethod = "recent" | "seasonal" | "average" | "greater";

export interface RecSettings {
  method: RecMethod;
  recentDays: number;
  seasonalStart: string | null;
  seasonalEnd: string | null;
  upliftPct: number;
}

export interface DateWindow {
  start: string;
  end: string;
}

export const DEFAULT_REC_SETTINGS: RecSettings = {
  method: "greater",
  recentDays: 90,
  seasonalStart: null,
  seasonalEnd: null,
  upliftPct: 0,
};

const METHODS: readonly RecMethod[] = ["recent", "seasonal", "average", "greater"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const toMs = (s: string) => Date.parse(`${s}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function validateSeasonalWindow(start: unknown, end: unknown): string | null {
  if (start == null && end == null) return null;
  if (start == null || end == null) return "Seasonal start and end must both be set or both be empty";
  if (!isIsoDate(start) || !isIsoDate(end)) return "Seasonal dates must be YYYY-MM-DD";
  if (toMs(start) > toMs(end)) return "Seasonal start must be on or before the end";
  if ((toMs(end) - toMs(start)) / DAY_MS + 1 > 366) return "Seasonal window cannot exceed 366 days";
  return null;
}

const isIntIn = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const blankToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

export function validateRecSettings(
  body: unknown,
): { ok: true; value: RecSettings } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!METHODS.includes(b.method as RecMethod)) return { ok: false, error: "method must be recent, seasonal or average" };
  if (!isIntIn(b.recentDays, 7, 365)) return { ok: false, error: "recentDays must be an integer 7–365" };
  if (!isIntIn(b.upliftPct, 0, 200)) return { ok: false, error: "upliftPct must be an integer 0–200" };
  const seasonalStart = blankToNull(b.seasonalStart);
  const seasonalEnd = blankToNull(b.seasonalEnd);
  const winErr = validateSeasonalWindow(seasonalStart, seasonalEnd);
  if (winErr) return { ok: false, error: winErr };
  return {
    ok: true,
    value: {
      method: b.method as RecMethod,
      recentDays: b.recentDays as number,
      seasonalStart: seasonalStart as string | null,
      seasonalEnd: seasonalEnd as string | null,
      upliftPct: b.upliftPct as number,
    },
  };
}

export function sameQuarterLastYear(today: string): DateWindow {
  const y = Number(today.slice(0, 4)) - 1;
  const q = Math.ceil(Number(today.slice(5, 7)) / 3);
  const startMonth = (q - 1) * 3; // 0-based
  return {
    start: fromMs(Date.UTC(y, startMonth, 1)),
    end: fromMs(Date.UTC(y, startMonth + 3, 0)),
  };
}

// The report goes out in the first days of a month, so "the next 90 days last
// year" is this month and the two after it, one year back: Oct 2026 → Oct–Dec 2025.
export function nextThreeMonthsLastYear(today: string): DateWindow {
  const y = Number(today.slice(0, 4)) - 1;
  const m = Number(today.slice(5, 7)) - 1; // 0-based
  return {
    start: fromMs(Date.UTC(y, m, 1)),
    end: fromMs(Date.UTC(y, m + 3, 0)),
  };
}

export function recentWindow(recentDays: number, today: string): DateWindow {
  return { start: fromMs(toMs(today) - recentDays * DAY_MS), end: today };
}

export function resolveSeasonalWindow(
  s: Pick<RecSettings, "seasonalStart" | "seasonalEnd">,
  today: string,
): DateWindow {
  if (s.seasonalStart && s.seasonalEnd) return { start: s.seasonalStart, end: s.seasonalEnd };
  return nextThreeMonthsLastYear(today);
}

export function describeMethod(s: RecSettings, today: string): string {
  const w = resolveSeasonalWindow(s, today);
  const seasonal = `${w.start}→${w.end}`;
  const base =
    s.method === "recent"
      ? `Recent ${s.recentDays}d`
      : s.method === "seasonal"
        ? `Seasonal ${seasonal}`
        : s.method === "greater"
          ? `Greater of ${s.recentDays}d & ${seasonal}`
          : `Average of ${s.recentDays}d & ${seasonal}`;
  return s.upliftPct > 0 ? `${base} · +${s.upliftPct}%` : base;
}
