import { describe, it, expect } from "vitest";
import {
  defaultWeekRange,
  recentWeekRanges,
  getSundayOfWeek,
  getWeekNumber,
  type WeekRange,
} from "./iso-week";

/**
 * Replicates the OLD refresh-sales cron week math (Sunday–Saturday off now.getDay()),
 * kept here only to document/lock-in the bug it caused. Newest first: [current, prev, prev2].
 */
function oldCronWeeks(now: Date): WeekRange[] {
  const dow = now.getDay();
  const currentSunday = new Date(now);
  currentSunday.setDate(now.getDate() - dow);
  const mk = (sun: Date): WeekRange => {
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: fmt(sun), end: fmt(sat) };
  };
  return [0, 1, 2].map((i) => {
    const sun = new Date(currentSunday);
    sun.setDate(currentSunday.getDate() - 7 * i);
    return mk(sun);
  });
}

const has = (ranges: WeekRange[], r: WeekRange) =>
  ranges.some((w) => w.start === r.start && w.end === r.end);

describe("iso-week", () => {
  it("defaultWeekRange matches frontend default for the reported Monday (Jun 8 2026 → 2026W23)", () => {
    // page.tsx: selectedWeek = currentWeek - 1; getSundayOfWeek(year, week)
    const now = new Date(2026, 5, 8); // Mon Jun 8 2026
    expect(getWeekNumber(now)).toBe(24);
    expect(defaultWeekRange(now)).toEqual({ start: "2026-05-31", end: "2026-06-06" });
  });

  it("REGRESSION: old Sun–Sat cron failed to pre-warm the frontend default on Sunday", () => {
    const sunday = new Date(2026, 5, 7); // Sun Jun 7 2026, frontend default = 2026W22 (May24–30)
    const def = defaultWeekRange(sunday);
    expect(def).toEqual({ start: "2026-05-24", end: "2026-05-30" });
    // Old cron warmed only current + previous = [Jun7–13, May31–Jun6] → MISS.
    expect(has(oldCronWeeks(sunday).slice(0, 2), def)).toBe(false);
  });

  it("FIX: recentWeekRanges(now, 2) always includes the frontend default, every day for 5 weeks", () => {
    const base = new Date(2026, 4, 1); // May 1 2026
    for (let i = 0; i < 35; i++) {
      const now = new Date(base);
      now.setDate(base.getDate() + i);
      const def = defaultWeekRange(now);
      expect(
        has(recentWeekRanges(now, 2), def),
        `default ${def.start}..${def.end} not warmed on ${now.toDateString()}`,
      ).toBe(true);
    }
  });

  it("recentWeekRanges is newest-first, contiguous, 7-day Sun–Sat blocks", () => {
    const now = new Date(2026, 5, 8);
    const ranges = recentWeekRanges(now, 3);
    expect(ranges[0]).toEqual({ start: "2026-06-07", end: "2026-06-13" }); // current ISO week
    expect(ranges[1]).toEqual({ start: "2026-05-31", end: "2026-06-06" }); // previous = default
    expect(ranges[2]).toEqual({ start: "2026-05-24", end: "2026-05-30" });
    for (const r of ranges) {
      const s = new Date(r.start + "T00:00:00");
      const e = new Date(r.end + "T00:00:00");
      expect(s.getDay()).toBe(0); // Sunday
      expect(e.getDay()).toBe(6); // Saturday
      expect((e.getTime() - s.getTime()) / 86400000).toBe(6);
    }
  });

  it("handles the year-boundary week (early January) — default is index 0 when currentWeek === 1", () => {
    const jan1 = new Date(2027, 0, 1); // Fri Jan 1 2027 → ISO week 53 of 2026
    const jan5 = new Date(2027, 0, 5); // Tue Jan 5 2027 → ISO week 1 of 2027
    expect(getWeekNumber(jan5)).toBe(1);
    // currentWeek === 1 → frontend stays on week 1 (does not go to week 0)
    expect(has(recentWeekRanges(jan5, 2), defaultWeekRange(jan5))).toBe(true);
    expect(has(recentWeekRanges(jan1, 2), defaultWeekRange(jan1))).toBe(true);
  });
});
