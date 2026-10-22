import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import {
  getCachedReport,
  setCachedReport,
  buildDatedKey,
  buildAccountKey,
  buildKeywordKey,
  buildAsinKey,
} from "./reports-cache";

describe("reports-cache key builders", () => {
  it("buildDatedKey normalizes comma-separated accountIds (sort + trim)", () => {
    expect(buildDatedKey("b, a, c", "2026-04-01", "2026-04-30")).toBe(
      "a,b,c|2026-04-01|2026-04-30",
    );
  });

  it("buildAccountKey normalizes accountIds without dates", () => {
    expect(buildAccountKey("2,1")).toBe("1,2");
  });

  it("buildKeywordKey appends keyword unchanged", () => {
    expect(buildKeywordKey("1", "2026-04-01", "2026-04-30", "dog treats")).toBe(
      "1|2026-04-01|2026-04-30|dog treats",
    );
  });

  it("buildAsinKey appends asin unchanged", () => {
    expect(buildAsinKey("1", "2026-04-01", "2026-04-30", "B0ABC")).toBe(
      "1|2026-04-01|2026-04-30|B0ABC",
    );
  });

  it("same input set produces same key regardless of order/whitespace", () => {
    expect(buildDatedKey("b,a", "2026-04-01", "2026-04-30")).toBe(
      buildDatedKey("a, b", "2026-04-01", "2026-04-30"),
    );
  });
});

describe("getCachedReport", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockSelectResult(rows: Array<{ data: unknown; updatedAt: Date }>) {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    });
  }

  it("returns null on cache miss", async () => {
    mockSelectResult([]);
    expect(await getCachedReport("report-overview", "k")).toBeNull();
  });

  it("returns null when row is older than 24h", async () => {
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockSelectResult([{ data: { x: 1 }, updatedAt: stale }]);
    expect(await getCachedReport("report-overview", "k")).toBeNull();
  });

  it("returns data when row is fresh", async () => {
    const fresh = new Date(Date.now() - 1000);
    mockSelectResult([{ data: { x: 1 }, updatedAt: fresh }]);
    expect(await getCachedReport("report-overview", "k")).toEqual({ x: 1 });
  });
});

describe("setCachedReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("upserts (insert + on-conflict update)", async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });

    await setCachedReport("report-overview", "k", { x: 1 });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        cacheType: "report-overview",
        cacheKey: "k",
        data: { x: 1 },
      }),
    );
    expect(onConflictDoUpdate).toHaveBeenCalled();
  });
});
