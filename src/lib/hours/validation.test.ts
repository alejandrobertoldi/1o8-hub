import { describe, it, expect } from "vitest";
import {
  normalizeRange,
  findOverlaps,
  isValidDateString,
  parseTimeToMinutes,
  formatHoursMinutes,
  computeShift,
  endMinutes,
  addDays,
  nextEntryStart,
} from "./validation";

describe("normalizeRange", () => {
  it("accepts start/end and computes hours", () => {
    const r = normalizeRange({ startTime: "09:00", endTime: "11:30" });
    expect(r).toEqual({
      ok: true,
      range: { startTime: "09:00", endTime: "11:30", hours: 2.5 },
    });
  });

  it("converts durationHours to endTime exactly", () => {
    const r = normalizeRange({ startTime: "09:00", durationHours: 2.5 });
    expect(r).toEqual({
      ok: true,
      range: { startTime: "09:00", endTime: "11:30", hours: 2.5 },
    });
  });

  it("rejects end <= start (zero-length)", () => {
    const r = normalizeRange({ startTime: "09:00", endTime: "09:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects a cross-midnight range on the single-segment path", () => {
    const r = normalizeRange({ startTime: "23:00", endTime: "01:00" });
    expect(r.ok).toBe(false);
  });

  it("rejects a cross-midnight duration on the single-segment path", () => {
    const r = normalizeRange({ startTime: "23:00", durationHours: 2 });
    expect(r.ok).toBe(false);
  });

  it("rejects zero and negative durations", () => {
    expect(normalizeRange({ startTime: "09:00", durationHours: 0 }).ok).toBe(false);
    expect(normalizeRange({ startTime: "09:00", durationHours: -1 }).ok).toBe(false);
  });

  it("rejects providing both endTime and durationHours", () => {
    const r = normalizeRange({ startTime: "09:00", endTime: "10:00", durationHours: 1 });
    expect(r.ok).toBe(false);
  });

  it("rejects providing neither endTime nor durationHours", () => {
    expect(normalizeRange({ startTime: "09:00" }).ok).toBe(false);
  });

  it("rejects malformed times", () => {
    expect(normalizeRange({ startTime: "9am", endTime: "10:00" }).ok).toBe(false);
    expect(normalizeRange({ startTime: "09:00", endTime: "25:00" }).ok).toBe(false);
  });

  it("accepts a same-day shift ending exactly at midnight", () => {
    const r = normalizeRange({ startTime: "22:30", endTime: "00:00" });
    expect(r).toEqual({
      ok: true,
      range: { startTime: "22:30", endTime: "24:00", hours: 1.5 },
    });
  });
});

describe("findOverlaps", () => {
  const others = [
    { id: "a", clientIdCode: "X", startTime: "09:00:00", endTime: "10:00:00" },
    { id: "b", clientIdCode: "Y", startTime: "13:00:00", endTime: "15:00:00" },
  ];

  it("detects a true overlap", () => {
    const hits = findOverlaps({ startTime: "09:30", endTime: "10:30" }, others);
    expect(hits.map((h) => h.id)).toEqual(["a"]);
  });

  it("touching edges are NOT overlaps", () => {
    const hits = findOverlaps({ startTime: "10:00", endTime: "13:00" }, others);
    expect(hits).toEqual([]);
  });

  it("containment counts as overlap", () => {
    const hits = findOverlaps({ startTime: "13:30", endTime: "14:00" }, others);
    expect(hits.map((h) => h.id)).toEqual(["b"]);
  });

  it("detects overlap against a row that ends at midnight", () => {
    const hits = findOverlaps(
      { startTime: "23:00", endTime: "23:30" },
      [{ id: "m", clientIdCode: "Z", startTime: "22:30:00", endTime: "00:00:00" }]
    );
    expect(hits.map((h) => h.id)).toEqual(["m"]);
  });
});

describe("isValidDateString", () => {
  it("accepts YYYY-MM-DD", () => {
    expect(isValidDateString("2026-07-16")).toBe(true);
  });
  it("rejects garbage and impossible dates", () => {
    expect(isValidDateString("16/07/2026")).toBe(false);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(isValidDateString("")).toBe(false);
  });
});

describe("formatHoursMinutes", () => {
  it("formats hours and minutes zero-padded", () => {
    expect(formatHoursMinutes(8.08)).toBe("08:05");
    expect(formatHoursMinutes(1.5)).toBe("01:30");
  });
  it("keeps whole hours as HH:00", () => {
    expect(formatHoursMinutes(1)).toBe("01:00");
    expect(formatHoursMinutes(2)).toBe("02:00");
  });
  it("keeps sub-hour as 00:MM", () => {
    expect(formatHoursMinutes(0.5)).toBe("00:30");
    expect(formatHoursMinutes(0)).toBe("00:00");
  });
  it("does not truncate 3-digit hour totals", () => {
    expect(formatHoursMinutes(123.5)).toBe("123:30");
  });
  it("reads as a duration, not a clock time - past 24h it does not wrap", () => {
    expect(formatHoursMinutes(30)).toBe("30:00");
    expect(formatHoursMinutes(24)).toBe("24:00");
  });
  it("returns em dash for non-finite", () => {
    expect(formatHoursMinutes(NaN)).toBe("—");
  });
});

describe("parseTimeToMinutes", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTimeToMinutes("09:30")).toBe(570);
    expect(parseTimeToMinutes("09:30:00")).toBe(570);
    expect(parseTimeToMinutes("24:00")).toBe(24 * 60); // end-of-day sentinel
  });
  it("returns null for invalid input", () => {
    expect(parseTimeToMinutes("25:00")).toBeNull();
    expect(parseTimeToMinutes("9am")).toBeNull();
  });
});

describe("computeShift", () => {
  it("same-day range → one segment (regression)", () => {
    const r = computeShift({ startTime: "09:00", endTime: "17:00" });
    expect(r).toEqual({
      ok: true,
      segments: [{ dayOffset: 0, startTime: "09:00", endTime: "17:00", hours: 8 }],
    });
  });

  it("ends exactly at midnight → one segment ending 00:00", () => {
    const r = computeShift({ startTime: "22:30", endTime: "00:00" });
    expect(r).toEqual({
      ok: true,
      segments: [{ dayOffset: 0, startTime: "22:30", endTime: "24:00", hours: 1.5 }],
    });
  });

  it("duration ending exactly at midnight → one segment", () => {
    const r = computeShift({ startTime: "22:30", durationHours: 1.5 });
    expect(r).toEqual({
      ok: true,
      segments: [{ dayOffset: 0, startTime: "22:30", endTime: "24:00", hours: 1.5 }],
    });
  });

  it("end-time past midnight → two segments split at midnight", () => {
    const r = computeShift({ startTime: "22:30", endTime: "02:00" });
    expect(r).toEqual({
      ok: true,
      segments: [
        { dayOffset: 0, startTime: "22:30", endTime: "24:00", hours: 1.5 },
        { dayOffset: 1, startTime: "00:00", endTime: "02:00", hours: 2 },
      ],
    });
  });

  it("duration past midnight → two segments", () => {
    const r = computeShift({ startTime: "22:30", durationHours: 3.5 });
    expect(r.ok && r.segments.map((s) => s.hours)).toEqual([1.5, 2]);
  });

  it("rejects a reversed-time typo over the 16h cap", () => {
    const r = computeShift({ startTime: "09:00", endTime: "07:00" }); // 22h span
    expect(r.ok).toBe(false);
  });

  it("rejects an equal start/end (24h span)", () => {
    expect(computeShift({ startTime: "09:00", endTime: "09:00" }).ok).toBe(false);
  });

  it("allows a shift of exactly 16h", () => {
    const r = computeShift({ startTime: "22:30", durationHours: 16 });
    expect(r.ok).toBe(true);
    expect(r.ok && r.segments.length).toBe(2);
  });

  it("rejects a shift longer than 16h via duration", () => {
    expect(computeShift({ startTime: "09:00", durationHours: 16.5 }).ok).toBe(false);
  });

  it("rejects both/neither endTime and durationHours", () => {
    expect(computeShift({ startTime: "09:00", endTime: "10:00", durationHours: 1 }).ok).toBe(false);
    expect(computeShift({ startTime: "09:00" }).ok).toBe(false);
  });

  it("rejects malformed start", () => {
    expect(computeShift({ startTime: "9am", endTime: "10:00" }).ok).toBe(false);
  });
});

describe("endMinutes", () => {
  it("normal end returns raw minutes", () => {
    expect(endMinutes("09:00", "17:00")).toBe(1020);
  });
  it("end at 00:00 (<= start) reads as end-of-day 1440", () => {
    expect(endMinutes("22:30", "00:00")).toBe(1440);
  });
});

describe("addDays", () => {
  it("adds a day", () => {
    expect(addDays("2026-07-20", 1)).toBe("2026-07-21");
  });
  it("rolls over a month boundary", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("rolls over a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("nextEntryStart", () => {
  it("chains the next entry to the end of the one just logged", () => {
    expect(nextEntryStart({ entryDate: "2026-08-04", endTime: "21:30" })).toEqual({
      entryDate: "2026-08-04",
      startTime: "21:30",
    });
  });

  it("rolls to 00:00 the next day when the entry ends at end-of-day 24:00", () => {
    expect(nextEntryStart({ entryDate: "2026-08-04", endTime: "24:00" })).toEqual({
      entryDate: "2026-08-05",
      startTime: "00:00",
    });
  });

  it("treats a 00:00 end as end-of-day too", () => {
    expect(nextEntryStart({ entryDate: "2026-08-31", endTime: "00:00" })).toEqual({
      entryDate: "2026-09-01",
      startTime: "00:00",
    });
  });

  it("accepts a Postgres HH:MM:SS end time", () => {
    expect(nextEntryStart({ entryDate: "2026-08-04", endTime: "17:45:00" })).toEqual({
      entryDate: "2026-08-04",
      startTime: "17:45",
    });
  });
});
