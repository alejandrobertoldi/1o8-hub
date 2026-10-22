import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above plain consts → create mocks with vi.hoisted.
const { fetchSearchTermTotals, selectResult, insertSpy } = vi.hoisted(() => ({
  fetchSearchTermTotals: vi.fn(),
  selectResult: [] as { data: unknown; updatedAt: Date }[],
  insertSpy: vi.fn(),
}));

vi.mock("@/lib/ppc-queries", () => ({ fetchSearchTermTotals }));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    insert: () => ({ values: (v: unknown) => ({ onConflictDoUpdate: async () => insertSpy(v) }) }),
  },
}));

import { isFresh, loadSearchTerms, CACHE_TTL_MS } from "./ppc-status-data";

const w = { start: "2026-08-01", end: "2026-08-30", days: 30 };

beforeEach(() => {
  fetchSearchTermTotals.mockReset();
  insertSpy.mockReset();
  selectResult.length = 0;
});

describe("isFresh", () => {
  it("true inside TTL, false after", () => {
    const now = Date.now();
    expect(isFresh(new Date(now - 1000), now)).toBe(true);
    expect(isFresh(new Date(now - CACHE_TTL_MS - 1), now)).toBe(false);
  });
});

describe("loadSearchTerms", () => {
  it("cache hit → no Redshift call, fetchedAt is the cache row's updatedAt", async () => {
    const cachedAt = new Date(Date.now() - 1000); // well within the 24h TTL
    selectResult.push({ data: [{ search_term: "x" }], updatedAt: cachedAt });
    const result = await loadSearchTerms(7, w);
    expect(result.rows).toEqual([{ search_term: "x" }]);
    expect(result.fetchedAt).toEqual(cachedAt);
    expect(fetchSearchTermTotals).not.toHaveBeenCalled();
  });

  it("miss → Redshift, then cache write keyed accountId|start|end, fetchedAt is now", async () => {
    fetchSearchTermTotals.mockResolvedValue([{ search_term: "y" }]);
    const before = Date.now();
    const result = await loadSearchTerms(7, w);
    expect(fetchSearchTermTotals).toHaveBeenCalledWith(7, "2026-08-01", "2026-08-30");
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ cacheType: "seo-ppc-status", cacheKey: "7|2026-08-01|2026-08-30" }));
    expect(result.rows).toEqual([{ search_term: "y" }]);
    expect(result.fetchedAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("Redshift error → throws, no cache write", async () => {
    fetchSearchTermTotals.mockRejectedValue(new Error("timeout"));
    await expect(loadSearchTerms(7, w)).rejects.toThrow("timeout");
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
