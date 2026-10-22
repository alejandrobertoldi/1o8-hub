import { describe, expect, it } from "vitest";
import {
  countWorkingDays,
  overlaps,
  isDateString,
  assertDateString,
} from "./working-days";

const NO_HOLIDAYS = new Set<string>();

describe("countWorkingDays", () => {
  it("counts a single weekday as 1", () => {
    // 2026-08-03 is a Monday
    expect(countWorkingDays("2026-08-03", "2026-08-03", NO_HOLIDAYS)).toBe(1);
  });

  it("counts a single Saturday as 0", () => {
    // 2026-08-01 is a Saturday
    expect(countWorkingDays("2026-08-01", "2026-08-01", NO_HOLIDAYS)).toBe(0);
  });

  it("counts a single Sunday as 0", () => {
    // 2026-08-02 is a Sunday
    expect(countWorkingDays("2026-08-02", "2026-08-02", NO_HOLIDAYS)).toBe(0);
  });

  it("counts Monday through Friday as 5", () => {
    expect(countWorkingDays("2026-08-03", "2026-08-07", NO_HOLIDAYS)).toBe(5);
  });

  it("excludes the weekend from a Monday-to-Sunday range", () => {
    expect(countWorkingDays("2026-08-03", "2026-08-09", NO_HOLIDAYS)).toBe(5);
  });

  it("counts two full weeks as 10", () => {
    expect(countWorkingDays("2026-08-03", "2026-08-14", NO_HOLIDAYS)).toBe(10);
  });

  it("spans a month boundary", () => {
    // Mon 2026-08-31 .. Fri 2026-09-04
    expect(countWorkingDays("2026-08-31", "2026-09-04", NO_HOLIDAYS)).toBe(5);
  });

  it("spans a year boundary", () => {
    // Mon 2026-12-28 .. Fri 2027-01-01
    expect(countWorkingDays("2026-12-28", "2027-01-01", NO_HOLIDAYS)).toBe(5);
  });

  it("subtracts a holiday inside the range", () => {
    const holidays = new Set(["2026-08-05"]); // Wednesday
    expect(countWorkingDays("2026-08-03", "2026-08-07", holidays)).toBe(4);
  });

  it("does not double-subtract a holiday that falls on a Saturday", () => {
    const holidays = new Set(["2026-08-08"]); // Saturday
    expect(countWorkingDays("2026-08-03", "2026-08-09", holidays)).toBe(5);
  });

  it("returns 0 when the only day requested is a holiday", () => {
    const holidays = new Set(["2026-08-03"]);
    expect(countWorkingDays("2026-08-03", "2026-08-03", holidays)).toBe(0);
  });

  it("ignores holidays outside the range", () => {
    const holidays = new Set(["2026-09-01"]);
    expect(countWorkingDays("2026-08-03", "2026-08-07", holidays)).toBe(5);
  });

  it("throws when endDate precedes startDate", () => {
    expect(() => countWorkingDays("2026-08-07", "2026-08-03", NO_HOLIDAYS)).toThrow(
      /on or after/
    );
  });

  it("throws on a malformed date", () => {
    expect(() => countWorkingDays("03-08-2026", "2026-08-07", NO_HOLIDAYS)).toThrow(
      /YYYY-MM-DD/
    );
  });
});

describe("overlaps", () => {
  // Reference range: 2026-08-10 .. 2026-08-14
  const A_START = "2026-08-10";
  const A_END = "2026-08-14";

  it("is false when B ends strictly before A starts", () => {
    expect(overlaps(A_START, A_END, "2026-08-03", "2026-08-07")).toBe(false);
  });

  it("is true when B ends exactly on A's start", () => {
    expect(overlaps(A_START, A_END, "2026-08-03", "2026-08-10")).toBe(true);
  });

  it("is true on partial overlap at the front", () => {
    expect(overlaps(A_START, A_END, "2026-08-07", "2026-08-11")).toBe(true);
  });

  it("is true when B is contained in A", () => {
    expect(overlaps(A_START, A_END, "2026-08-11", "2026-08-12")).toBe(true);
  });

  it("is true when B contains A", () => {
    expect(overlaps(A_START, A_END, "2026-08-01", "2026-08-31")).toBe(true);
  });

  it("is true when B starts exactly on A's end", () => {
    expect(overlaps(A_START, A_END, "2026-08-14", "2026-08-20")).toBe(true);
  });

  it("is false when B starts strictly after A ends", () => {
    expect(overlaps(A_START, A_END, "2026-08-17", "2026-08-21")).toBe(false);
  });

  it("is true for two identical ranges", () => {
    expect(overlaps(A_START, A_END, A_START, A_END)).toBe(true);
  });
});

describe("isDateString", () => {
  it("accepts a well-formed date", () => {
    expect(isDateString("2026-08-03")).toBe(true);
  });

  it("rejects a non-string", () => {
    expect(isDateString(20260803)).toBe(false);
  });

  it("rejects the wrong shape", () => {
    expect(isDateString("2026-8-3")).toBe(false);
  });

  it("rejects a calendar-impossible date", () => {
    expect(isDateString("2026-02-30")).toBe(false);
  });
});

describe("assertDateString", () => {
  it("names the offending field in the error", () => {
    expect(() => assertDateString("nope", "startDate")).toThrow(/startDate/);
  });
});
