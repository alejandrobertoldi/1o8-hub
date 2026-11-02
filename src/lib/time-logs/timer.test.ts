import { describe, expect, it } from "vitest";
import { formatClock, secondsToHours, timerSeconds } from "./timer";

describe("timerSeconds", () => {
  it("adds the running stretch to the banked time", () => {
    const now = Date.parse("2026-11-02T10:30:00Z");
    expect(timerSeconds({ startedAt: "2026-11-02T10:00:00Z", elapsedSeconds: 600 }, now)).toBe(2400);
    expect(timerSeconds({ startedAt: null, elapsedSeconds: 600 }, now)).toBe(600);
  });
});

describe("secondsToHours", () => {
  it("rounds to the nearest quarter hour, never below one step", () => {
    expect(secondsToHours(60)).toBe(0.25);
    expect(secondsToHours(22 * 60)).toBe(0.25);
    expect(secondsToHours(23 * 60)).toBe(0.5);
    expect(secondsToHours(100 * 60)).toBe(1.75);
    expect(secondsToHours(30 * 3600)).toBe(24);
  });
});

describe("formatClock", () => {
  it("shows h:mm:ss", () => {
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(59)).toBe("0:00:59");
  });
});
