import { describe, it, expect } from "vitest";

// Extract the delta computation logic from the impact API route
function computeDelta(
  before: number | null,
  after: number | null
): { absolute: number; percentage: number | null } | null {
  if (before === null || after === null) return null;
  if (before === 0) return { absolute: after, percentage: null };
  const pct = Math.round(((after - before) / before) * 100);
  return { absolute: after - before, percentage: pct };
}

function computeImpactStatus(
  beforeSnap: { avgDailyUnits: number | null; liveAt: Date } | null,
  afterSnap: { avgDailyUnits: number | null } | null
): { status: string; daysRemaining: number | null } {
  if (!beforeSnap) {
    return { status: "no_baseline", daysRemaining: null };
  }
  if (!afterSnap) {
    const daysSinceLive = Math.floor(
      (Date.now() - beforeSnap.liveAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    return { status: "pending", daysRemaining: Math.max(0, 14 - daysSinceLive) };
  }
  return { status: "ready", daysRemaining: null };
}

describe("computeDelta", () => {
  it("computes correct positive percentage", () => {
    const result = computeDelta(100, 123);
    expect(result).toEqual({ absolute: 23, percentage: 23 });
  });

  it("computes correct negative percentage", () => {
    const result = computeDelta(100, 85);
    expect(result).toEqual({ absolute: -15, percentage: -15 });
  });

  it("returns null when before is null", () => {
    expect(computeDelta(null, 100)).toBeNull();
  });

  it("returns null when after is null", () => {
    expect(computeDelta(100, null)).toBeNull();
  });

  it("returns absolute value when before is zero (no percentage)", () => {
    const result = computeDelta(0, 50);
    expect(result).toEqual({ absolute: 50, percentage: null });
  });

  it("handles both values being zero", () => {
    const result = computeDelta(0, 0);
    expect(result).toEqual({ absolute: 0, percentage: null });
  });

  it("rounds percentage to nearest integer", () => {
    const result = computeDelta(3, 4);
    expect(result).toEqual({ absolute: 1, percentage: 33 });
  });
});

describe("computeImpactStatus", () => {
  it("returns no_baseline when no before snapshot", () => {
    const result = computeImpactStatus(null, null);
    expect(result.status).toBe("no_baseline");
    expect(result.daysRemaining).toBeNull();
  });

  it("returns pending when before exists but no after", () => {
    const liveAt = new Date();
    liveAt.setDate(liveAt.getDate() - 5); // 5 days ago
    const result = computeImpactStatus(
      { avgDailyUnits: 100, liveAt },
      null
    );
    expect(result.status).toBe("pending");
    expect(result.daysRemaining).toBe(9); // 14 - 5
  });

  it("returns 0 days remaining when 14+ days have passed", () => {
    const liveAt = new Date();
    liveAt.setDate(liveAt.getDate() - 20); // 20 days ago
    const result = computeImpactStatus(
      { avgDailyUnits: 100, liveAt },
      null
    );
    expect(result.status).toBe("pending");
    expect(result.daysRemaining).toBe(0);
  });

  it("returns ready when both snapshots exist", () => {
    const result = computeImpactStatus(
      { avgDailyUnits: 100, liveAt: new Date() },
      { avgDailyUnits: 130 }
    );
    expect(result.status).toBe("ready");
    expect(result.daysRemaining).toBeNull();
  });
});
