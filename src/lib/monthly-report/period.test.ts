import { describe, it, expect } from "vitest";
import { resolvePeriod, lastCompletedMonth, slugify } from "./period";

describe("resolvePeriod", () => {
  it("expands '2026-03' to a full month window with prior month", () => {
    expect(resolvePeriod("2026-03")).toEqual({
      period: "2026-03",
      start: "2026-03-01",
      end: "2026-03-31",
      prevStart: "2026-02-01",
      prevEnd: "2026-02-28",
      label: "March 2026",
    });
  });

  it("handles December → November rollover", () => {
    const p = resolvePeriod("2025-12");
    expect(p.start).toBe("2025-12-01");
    expect(p.end).toBe("2025-12-31");
    expect(p.prevStart).toBe("2025-11-01");
    expect(p.prevEnd).toBe("2025-11-30");
  });

  it("handles January → previous-year December rollover", () => {
    const p = resolvePeriod("2026-01");
    expect(p.prevStart).toBe("2025-12-01");
    expect(p.prevEnd).toBe("2025-12-31");
    expect(p.label).toBe("January 2026");
  });

  it("handles February leap year", () => {
    expect(resolvePeriod("2024-02").end).toBe("2024-02-29");
  });

  it("throws on malformed input", () => {
    expect(() => resolvePeriod("26-3")).toThrow();
    expect(() => resolvePeriod("2026-13")).toThrow();
    expect(() => resolvePeriod("2026-00")).toThrow();
  });
});

describe("lastCompletedMonth", () => {
  it("returns previous month from the 4th onward (Amazon 3-4 day settlement)", () => {
    expect(lastCompletedMonth(new Date("2026-04-04T00:00:00Z"))).toBe("2026-03");
    expect(lastCompletedMonth(new Date("2026-04-05T12:00:00Z"))).toBe("2026-03");
    expect(lastCompletedMonth(new Date("2026-04-23T12:00:00Z"))).toBe("2026-03");
  });

  it("holds the previous month until day 4", () => {
    expect(lastCompletedMonth(new Date("2026-04-01T12:00:00Z"))).toBe("2026-02");
    expect(lastCompletedMonth(new Date("2026-04-02T12:00:00Z"))).toBe("2026-02");
    expect(lastCompletedMonth(new Date("2026-04-03T23:59:59Z"))).toBe("2026-02");
  });

  it("rolls year back correctly", () => {
    expect(lastCompletedMonth(new Date("2026-01-05T12:00:00Z"))).toBe("2025-12");
    expect(lastCompletedMonth(new Date("2026-01-03T12:00:00Z"))).toBe("2025-11");
  });
});

describe("slugify", () => {
  it("produces lowercase hyphenated slugs", () => {
    expect(slugify("Dr. Cuddles")).toBe("dr-cuddles");
    expect(slugify("Trejo's Tacos")).toBe("trejos-tacos");
    expect(slugify("Cloud23 Whole Foods")).toBe("cloud23-whole-foods");
  });
});
