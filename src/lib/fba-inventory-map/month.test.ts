import { describe, expect, it } from "vitest";
import { isMonth, monthLastDay, monthRange, monthsOverlapping, monthLabel } from "./month";

describe("month", () => {
  it("validates YYYY-MM", () => {
    expect(isMonth("2026-08")).toBe(true);
    for (const bad of ["2026-13", "2026-00", "2026-8", "26-08", "2026-08-01", "", "2026-08'; drop"]) expect(isMonth(bad), bad).toBe(false);
  });
  it("ranges are half-open and roll the year", () => {
    expect(monthRange("2026-08")).toEqual({ start: "2026-08-01", endExclusive: "2026-09-01" });
    expect(monthRange("2026-12")).toEqual({ start: "2026-12-01", endExclusive: "2027-01-01" });
  });
  it("monthLastDay handles 28/29/30/31", () => {
    expect(monthLastDay("2026-02")).toBe("2026-02-28");
    expect(monthLastDay("2028-02")).toBe("2028-02-29");
    expect(monthLastDay("2026-09")).toBe("2026-09-30");
    expect(monthLastDay("2026-12")).toBe("2026-12-31");
  });
});

describe("monthsOverlapping / monthLabel", () => {
  it("keeps months that overlap start..end (partial ends included), newest first", () => {
    const months = ["2026-05", "2026-08", "2026-06", "2026-07", "2026-09"];
    expect(monthsOverlapping(months, "2026-06-15", "2026-08-01")).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(monthsOverlapping(months, "2026-07-10", "2026-07-20")).toEqual(["2026-07"]);
    expect(monthsOverlapping(months, "2025-01-01", "2025-12-31")).toEqual([]);
    expect(monthsOverlapping([], "2026-01-01", "2026-12-31")).toEqual([]);
  });
  it("labels a month as Mon YYYY", () => {
    expect(monthLabel("2026-08")).toBe("Aug 2026");
    expect(monthLabel("2025-01")).toBe("Jan 2025");
    expect(monthLabel("2025-12")).toBe("Dec 2025");
  });
});
