import { describe, it, expect } from "vitest";
import {
  formatDateKey,
  getDaysInMonth,
  getFirstDayOfWeek,
  getGridWindow,
} from "./types";

/**
 * Rebuilds the 42 cell keys exactly the way MonthGrid.tsx does (its three
 * cell-building loops), so `getGridWindow`'s closed-form arithmetic can be
 * differentially checked against the real algorithm rather than against
 * expectations hand-derived from the same reasoning it uses.
 */
function monthGridCellKeys(year: number, month: number): string[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = getFirstDayOfWeek(year, month);

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  const keys: string[] = [];

  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    keys.push(formatDateKey(prevYear, prevMonth, daysInPrevMonth - i));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    keys.push(formatDateKey(year, month, d));
  }

  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const remaining = 42 - keys.length;
  for (let d = 1; d <= remaining; d++) {
    keys.push(formatDateKey(nextYear, nextMonth, d));
  }

  return keys;
}

describe("getGridWindow", () => {
  it("matches MonthGrid's first and last rendered cell for every month 2020-2030", () => {
    for (let year = 2020; year <= 2030; year++) {
      for (let month = 0; month < 12; month++) {
        const keys = monthGridCellKeys(year, month);
        expect(keys).toHaveLength(42);

        const { gridStart, gridEnd } = getGridWindow(year, month);
        expect({ year, month, gridStart }).toEqual({ year, month, gridStart: keys[0] });
        expect({ year, month, gridEnd }).toEqual({ year, month, gridEnd: keys[41] });
      }
    }
  });

  it("starts on the 1st when the month already begins on a Monday", () => {
    // 2026-06-01 is a Monday, so MonthGrid borrows no leading days.
    expect(getFirstDayOfWeek(2026, 5)).toBe(0);
    expect(getGridWindow(2026, 5).gridStart).toBe("2026-06-01");
  });

  it("borrows six leading days when the month begins on a Sunday", () => {
    // 2026-02-01 is a Sunday → Monday-start grid shows Jan 26 … Feb 1 in row 1.
    expect(getFirstDayOfWeek(2026, 1)).toBe(6);
    expect(getGridWindow(2026, 1).gridStart).toBe("2026-01-26");
  });

  it("reaches back into the previous year for a January view", () => {
    const { gridStart, gridEnd } = getGridWindow(2026, 0);
    expect(gridStart.slice(0, 4)).toBe("2025");
    expect(gridEnd.slice(0, 4)).toBe("2026");
  });

  it("reaches forward into the next year for a December view", () => {
    const { gridStart, gridEnd } = getGridWindow(2026, 11);
    expect(gridStart.slice(0, 4)).toBe("2026");
    expect(gridEnd.slice(0, 4)).toBe("2027");
  });

  it("always returns an ordered range spanning at least the whole month", () => {
    for (let month = 0; month < 12; month++) {
      const { gridStart, gridEnd } = getGridWindow(2026, month);
      const first = formatDateKey(2026, month, 1);
      const last = formatDateKey(2026, month, getDaysInMonth(2026, month));
      expect(gridStart <= first).toBe(true);
      expect(gridEnd >= last).toBe(true);
      expect(gridStart < gridEnd).toBe(true);
    }
  });
});
