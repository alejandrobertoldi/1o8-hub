import { describe, it, expect } from "vitest";
import { partitionHolidays, todayKeyInZone } from "./holiday-block";

const H = (
  id: string,
  holidayDate: string,
  name = id
) => ({ id, countryCode: "ES", holidayDate, name });

describe("partitionHolidays", () => {
  it("splits weekday holidays into enjoyed (≤ today) and upcoming", () => {
    // 2026-08-07 is a Friday
    const rows = [
      H("past", "2026-01-01"), // Thu
      H("today", "2026-08-07"), // Fri
      H("future", "2026-12-25"), // Fri
      H("sat", "2026-08-08"), // Sat
      H("sun", "2026-08-09"), // Sun
    ];
    const { enjoyed, upcoming, weekend } = partitionHolidays(rows, "2026-08-07");
    expect(enjoyed.map((h) => h.id)).toEqual(["past", "today"]);
    expect(upcoming.map((h) => h.id)).toEqual(["future"]);
    expect(weekend.map((h) => h.id)).toEqual(["sat", "sun"]);
  });
});

describe("todayKeyInZone", () => {
  it("formats a fixed instant in Europe/Madrid as YYYY-MM-DD", () => {
    // 2026-08-07T10:00:00Z is still 07 Aug in Madrid (UTC+2)
    const now = new Date("2026-08-07T10:00:00.000Z");
    expect(todayKeyInZone("Europe/Madrid", now)).toBe("2026-08-07");
  });

  it("falls back to UTC for an invalid zone", () => {
    const now = new Date("2026-08-07T10:00:00.000Z");
    expect(todayKeyInZone("Not/AZone", now)).toBe("2026-08-07");
  });
});
