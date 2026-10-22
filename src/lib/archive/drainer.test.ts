import { describe, it, expect } from "vitest";
import { computeFailurePatch, DRAIN_BUDGET_MS } from "@/lib/archive/drainer";

describe("computeFailurePatch", () => {
  it("attempt 1 of 3: retries — status pending, claimedAt cleared, finishedAt left null", () => {
    const now = new Date("2026-08-03T00:00:00Z");
    expect(computeFailurePatch(1, "boom", now)).toEqual({
      status: "pending",
      error: "boom",
      finishedAt: null,
      claimedAt: null,
    });
  });

  it("attempt 2 of 3: still retries — same shape as attempt 1", () => {
    const now = new Date("2026-08-03T00:00:00Z");
    expect(computeFailurePatch(2, "boom again", now)).toEqual({
      status: "pending",
      error: "boom again",
      finishedAt: null,
      claimedAt: null,
    });
  });

  it("attempt 3 of 3: terminal — status failed, finishedAt stamped, claimedAt left untouched (undefined)", () => {
    const now = new Date("2026-08-03T00:00:00Z");
    const patch = computeFailurePatch(3, "out of attempts", now);
    expect(patch.status).toBe("failed");
    expect(patch.error).toBe("out of attempts");
    expect(patch.finishedAt).toBe(now);
    expect(patch.claimedAt).toBeUndefined();
  });

  it("terminal claimedAt is undefined (Drizzle omits it from SET, preserving the claim timestamp as provenance), not null", () => {
    const patch = computeFailurePatch(3, "err", new Date());
    expect("claimedAt" in patch).toBe(true);
    expect(patch.claimedAt).not.toBeNull();
    expect(patch.claimedAt).toBeUndefined();
  });

  it("retry claimedAt is null (genuinely cleared so the row looks freshly pending), not undefined", () => {
    const patch = computeFailurePatch(1, "err", new Date());
    expect(patch.claimedAt).toBeNull();
  });

  it("retry finishedAt is null; terminal finishedAt is the passed-in now", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    expect(computeFailurePatch(1, "err", now).finishedAt).toBeNull();
    expect(computeFailurePatch(3, "err", now).finishedAt).toBe(now);
  });
});

describe("DRAIN_BUDGET_MS", () => {
  /**
   * The cron route's Vercel ceiling — src/app/api/cron/redshift-archive-drain/route.ts.
   * A unit claimed just before the budget expires still runs to completion, so
   * the gap between the budget and this ceiling is the real safety tail.
   */
  const ROUTE_MAX_DURATION_MS = 300_000;

  /**
   * Slowest single unit ever observed: 58.6s, 2026-08-14. This is a FLOOR, not
   * a ceiling — it was measured while share_of_voice's window was already two
   * days depleted, so a full 14-day window or a post-repair backfill will be
   * materially larger.
   */
  const WORST_OBSERVED_UNIT_MS = 58_600;

  it("leaves a tail longer than the worst unit ever observed, so a late claim cannot overrun the route's maxDuration", () => {
    expect(ROUTE_MAX_DURATION_MS - DRAIN_BUDGET_MS).toBeGreaterThan(WORST_OBSERVED_UNIT_MS);
  });

  it("keeps at least 1.5x margin over that worst unit — the previous 250_000 left a 50s tail, SMALLER than one unit, which is why it moved", () => {
    expect(ROUTE_MAX_DURATION_MS - DRAIN_BUDGET_MS).toBeGreaterThanOrEqual(1.5 * WORST_OBSERVED_UNIT_MS);
    // The old value, kept as documentation of the defect being fixed: a unit
    // claimed at 249s elapsed was killed mid-flight by the 300s hard stop,
    // leaving a 'running' row that reclaimStaleRuns only swept an hour later.
    expect(ROUTE_MAX_DURATION_MS - 250_000).toBeLessThan(WORST_OBSERVED_UNIT_MS);
  });
});
