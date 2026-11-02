/** Pure helpers for the optional time-tracking timer. */

/** Seconds on a timer at `now`: banked time plus the running stretch, if any. */
export function timerSeconds(t: { startedAt: Date | string | null; elapsedSeconds: number }, now = Date.now()): number {
  const running = t.startedAt ? Math.max(0, Math.floor((now - new Date(t.startedAt).getTime()) / 1000)) : 0;
  return t.elapsedSeconds + running;
}

/** Timer seconds → loggable hours: nearest step (0.25 h), at least one step, at most 24. */
export function secondsToHours(seconds: number, step = 0.25): number {
  const steps = Math.max(1, Math.round(seconds / 3600 / step));
  return Math.min(24, steps * step);
}

/** 3725 → "1:02:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
