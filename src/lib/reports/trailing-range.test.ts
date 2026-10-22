import { describe, expect, it } from "vitest";
import { trailingRange, warmedTrailingWindows, widestTrailingWindow } from "./trailing-range";

const NOW = new Date(2026, 8, 17); // 17 Sep 2026, local

describe("trailingRange", () => {
  it("ends yesterday so the cache key is stable for the whole day", () => {
    expect(trailingRange(365, NOW).end).toBe("2026-09-16");
  });

  it("counts the window inclusively", () => {
    expect(trailingRange(1, NOW)).toEqual({ start: "2026-09-16", end: "2026-09-16" });
    expect(trailingRange(2, NOW)).toEqual({ start: "2026-09-15", end: "2026-09-16" });
    expect(trailingRange(365, NOW).start).toBe("2025-09-17");
  });
});

describe("warmedTrailingWindows", () => {
  it("covers every non-custom preset the page offers", () => {
    expect(warmedTrailingWindows(NOW).map((w) => w.days)).toEqual([365, 180, 90]);
  });

  it("shares one end date across all windows", () => {
    const ends = new Set(warmedTrailingWindows(NOW).map((w) => w.end));
    expect(ends.size).toBe(1);
  });

  /**
   * The load-bearing invariant: the snapshot is captured for the widest
   * window and the shorter ones are sliced out of it, which is only valid
   * while every shorter window sits inside the widest.
   */
  it("keeps every shorter window inside the widest", () => {
    const widest = widestTrailingWindow(NOW);
    for (const w of warmedTrailingWindows(NOW)) {
      expect(w.start >= widest.start).toBe(true);
      expect(w.end <= widest.end).toBe(true);
    }
  });

  it("reports the widest window as the longest preset", () => {
    expect(widestTrailingWindow(NOW)).toEqual(trailingRange(365, NOW));
  });
});
