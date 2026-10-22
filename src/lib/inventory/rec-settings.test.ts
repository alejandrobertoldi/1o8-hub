import { describe, it, expect } from "vitest";
import {
  DEFAULT_REC_SETTINGS, isIsoDate, validateSeasonalWindow, validateRecSettings,
  sameQuarterLastYear, nextThreeMonthsLastYear, recentWindow, resolveSeasonalWindow, describeMethod,
} from "./rec-settings";

describe("isIsoDate", () => {
  it("accepts real dates", () => {
    expect(isIsoDate("2024-10-01")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });
  it("rejects malformed, impossible and hostile input", () => {
    for (const bad of ["2024-1-01", "2025-02-29", "2025-02-30", "2024-13-01", "", null, 20241001,
      "2024-01-01' OR 1=1 --", "2024-01-01T00:00:00Z"]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });
});

describe("validateSeasonalWindow", () => {
  it("allows both null", () => expect(validateSeasonalWindow(null, null)).toBeNull());
  it("rejects only one side set", () => {
    expect(validateSeasonalWindow("2024-10-01", null)).toMatch(/both/i);
  });
  it("rejects start after end", () => {
    expect(validateSeasonalWindow("2025-01-31", "2024-10-01")).toMatch(/before/i);
  });
  it("allows exactly 366 days, rejects 367", () => {
    expect(validateSeasonalWindow("2024-01-01", "2024-12-31")).toBeNull(); // 366 (leap)
    expect(validateSeasonalWindow("2024-01-01", "2025-01-01")).toMatch(/366/);
  });
  it("rejects injection strings", () => {
    expect(validateSeasonalWindow("2024-01-01' OR 1=1 --", "2024-02-01")).not.toBeNull();
  });
});

describe("validateRecSettings", () => {
  it("accepts a full seasonal config", () => {
    const r = validateRecSettings({ method: "seasonal", recentDays: 120, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 });
    expect(r).toEqual({ ok: true, value: { method: "seasonal", recentDays: 120, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 } });
  });
  it("normalises empty strings to null", () => {
    const r = validateRecSettings({ method: "recent", recentDays: 90, seasonalStart: "", seasonalEnd: "", upliftPct: 0 });
    expect(r.ok && r.value.seasonalStart).toBeNull();
  });
  it.each([
    [{ ...DEFAULT_REC_SETTINGS, method: "magic" }, /method/],
    [{ ...DEFAULT_REC_SETTINGS, recentDays: 6 }, /recentDays/],
    [{ ...DEFAULT_REC_SETTINGS, recentDays: 90.5 }, /recentDays/],
    [{ ...DEFAULT_REC_SETTINGS, upliftPct: 201 }, /upliftPct/],
    [{ ...DEFAULT_REC_SETTINGS, upliftPct: -1 }, /upliftPct/],
    [null, /body/i],
  ])("rejects %j", (body, msg) => {
    const r = validateRecSettings(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe("windows", () => {
  it("sameQuarterLastYear matches today's route behaviour", () => {
    expect(sameQuarterLastYear("2026-10-07")).toEqual({ start: "2025-10-01", end: "2025-12-31" });
    expect(sameQuarterLastYear("2026-02-10")).toEqual({ start: "2025-01-01", end: "2025-03-31" });
    expect(sameQuarterLastYear("2025-05-01")).toEqual({ start: "2024-04-01", end: "2024-06-30" });
  });
  it("recentWindow spans recentDays back to today", () => {
    expect(recentWindow(90, "2026-10-07")).toEqual({ start: "2026-07-09", end: "2026-10-07" });
  });
  it("resolveSeasonalWindow falls back to this month + the next two, last year", () => {
    expect(resolveSeasonalWindow({ seasonalStart: null, seasonalEnd: null }, "2026-10-07"))
      .toEqual({ start: "2025-10-01", end: "2025-12-31" });
    // Not the calendar quarter: November runs Nov–Jan.
    expect(resolveSeasonalWindow({ seasonalStart: null, seasonalEnd: null }, "2026-11-03"))
      .toEqual({ start: "2025-11-01", end: "2026-01-31" });
  });

  it("nextThreeMonthsLastYear crosses the year end and handles February", () => {
    expect(nextThreeMonthsLastYear("2026-12-02")).toEqual({ start: "2025-12-01", end: "2026-02-28" });
    expect(nextThreeMonthsLastYear("2025-01-05")).toEqual({ start: "2024-01-01", end: "2024-03-31" });
    expect(resolveSeasonalWindow({ seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31" }, "2026-10-07"))
      .toEqual({ start: "2024-10-01", end: "2025-01-31" });
  });
  it("describeMethod labels each method", () => {
    expect(describeMethod({ ...DEFAULT_REC_SETTINGS }, "2026-10-07")).toBe("Greater of 90d & 2025-10-01→2025-12-31");
    expect(describeMethod({ ...DEFAULT_REC_SETTINGS, method: "recent" }, "2026-10-07")).toBe("Recent 90d");
    expect(describeMethod({ method: "seasonal", recentDays: 90, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 }, "2026-10-07"))
      .toBe("Seasonal 2024-10-01→2025-01-31 · +30%");
    expect(describeMethod({ method: "average", recentDays: 120, seasonalStart: null, seasonalEnd: null, upliftPct: 0 }, "2026-10-07"))
      .toBe("Average of 120d & 2025-10-01→2025-12-31");
  });
});
