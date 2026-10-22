import { describe, it, expect } from "vitest";
import { formatDate, getFirstDayOfCurrentMonth, getWeekNumber, getSundayOfWeek, resolveRange } from "./report-date-range";

describe("report-date-range", () => {
  it("formatDate pads month/day", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("getFirstDayOfCurrentMonth returns the 1st", () => {
    expect(getFirstDayOfCurrentMonth(new Date(2026, 6, 29))).toBe("2026-07-01");
  });

  it("getWeekNumber matches known dates", () => {
    // 2026-01-01 falls in ISO week 1
    expect(getWeekNumber(new Date(2026, 0, 1))).toBe(1);
    // mid-year sanity
    expect(getWeekNumber(new Date(2026, 5, 15))).toBe(25);
  });

  it("getSundayOfWeek returns a Sunday", () => {
    const d = getSundayOfWeek(2026, 25);
    expect(d.getDay()).toBe(0); // Sunday
  });

  it("resolveRange week mode returns sunday..sunday+6", () => {
    const { start, end } = resolveRange("week", { customStart: "", customEnd: "", year: 2026, week: 25 });
    const s = new Date(start + "T00:00:00");
    const e = new Date(end + "T00:00:00");
    expect(s.getDay()).toBe(0);
    expect((e.getTime() - s.getTime()) / 86400000).toBe(6);
  });

  it("resolveRange custom mode passes through", () => {
    expect(resolveRange("custom", { customStart: "2026-06-01", customEnd: "2026-06-30", year: 2026, week: 1 }))
      .toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });
});
