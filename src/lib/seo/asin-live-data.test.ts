import { describe, it, expect, vi, beforeEach } from "vitest";

const { createQueryJob, fetchAsinTermWindows, fetchAdGroupShares, selectResult, insertSpy } = vi.hoisted(() => ({
  createQueryJob: vi.fn(),
  fetchAsinTermWindows: vi.fn(),
  fetchAdGroupShares: vi.fn(),
  selectResult: [] as { data: unknown; updatedAt: Date }[],
  insertSpy: vi.fn(),
}));
vi.mock("@/lib/bigquery", () => ({
  SEO_VERSIONS_READ_TABLE: "proj.MFBibleApp.SEO",
  getBigQueryClient: () => ({ createQueryJob }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    insert: () => ({ values: (v: unknown) => ({ onConflictDoUpdate: async () => insertSpy(v) }) }),
  },
}));
vi.mock("@/lib/ppc-queries", () => ({ fetchAsinTermWindows, fetchAdGroupShares }));

import { versionKey, loadVersionTexts, asinCacheKey, loadAsinTermWindows } from "./asin-live-data";

beforeEach(() => {
  createQueryJob.mockReset();
  fetchAsinTermWindows.mockReset();
  fetchAdGroupShares.mockReset();
  insertSpy.mockReset();
  selectResult.length = 0;
});

describe("versionKey / asinCacheKey", () => {
  it("builds stable keys, including the share-ASIN set (I2)", () => {
    expect(versionKey("B0X", 1)).toBe("B0X|1");
    expect(asinCacheKey(5, [
      { asin: "B", before: { start: "2026-01-01", end: "x" }, after: { start: "y", end: "2026-02-01" } },
      { asin: "A", before: { start: "2026-03-01", end: "x" }, after: { start: "y", end: "2026-04-01" } },
    ], ["A2", "A1"])).toBe("5|A:2026-03-01:2026-04-01,B:2026-01-01:2026-02-01|A1,A2");
  });
});

describe("loadAsinTermWindows (I2 — shares cached with windows)", () => {
  const specs = [{ asin: "A1", before: { start: "2026-06-01", end: "2026-06-30" }, after: { start: "2026-07-01", end: "2026-07-30" } }];

  it("cache hit → returns rows AND shares, zero Redshift calls", async () => {
    const cachedAt = new Date(Date.now() - 1000);
    selectResult.push({ data: { v: 2, rows: [{ asin: "A1", search_term: "x" }], shares: [{ asin: "A1", shared_with: 2 }] }, updatedAt: cachedAt });
    const result = await loadAsinTermWindows(7, specs, ["A1"]);
    expect(result.rows).toEqual([{ asin: "A1", search_term: "x" }]);
    expect(result.shares).toEqual([{ asin: "A1", shared_with: 2 }]);
    expect(result.fetchedAt).toEqual(cachedAt);
    expect(fetchAsinTermWindows).not.toHaveBeenCalled();
    expect(fetchAdGroupShares).not.toHaveBeenCalled();
  });

  it("old bare-array cache row (pre-I2) is treated as a miss", async () => {
    const cachedAt = new Date(Date.now() - 1000);
    selectResult.push({ data: [{ asin: "A1", search_term: "x" }], updatedAt: cachedAt });
    fetchAsinTermWindows.mockResolvedValue([{ asin: "A1", search_term: "y" }]);
    fetchAdGroupShares.mockResolvedValue([{ asin: "A1", shared_with: 1 }]);
    const result = await loadAsinTermWindows(7, specs, ["A1"]);
    expect(fetchAsinTermWindows).toHaveBeenCalled();
    expect(fetchAdGroupShares).toHaveBeenCalled();
    expect(result.rows).toEqual([{ asin: "A1", search_term: "y" }]);
    expect(result.shares).toEqual([{ asin: "A1", shared_with: 1 }]);
  });

  it("O3: a pre-v2 cache row (shares listed only SHARED ASINs) is a miss, so solo ASINs aren't read as unadvertised", async () => {
    selectResult.push({ data: { rows: [], shares: [{ asin: "A1", shared_with: 2 }] }, updatedAt: new Date(Date.now() - 1000) });
    fetchAsinTermWindows.mockResolvedValue([]);
    fetchAdGroupShares.mockResolvedValue([{ asin: "A1", shared_with: 0 }]);
    const result = await loadAsinTermWindows(7, specs, ["A1"]);
    expect(fetchAdGroupShares).toHaveBeenCalled();
    expect(result.shares).toEqual([{ asin: "A1", shared_with: 0 }]);
  });

  it("miss → fetches both, caches { rows, shares } together under one key", async () => {
    fetchAsinTermWindows.mockResolvedValue([{ asin: "A1", search_term: "y" }]);
    fetchAdGroupShares.mockResolvedValue([{ asin: "A1", shared_with: 1 }]);
    const result = await loadAsinTermWindows(7, specs, ["A1"]);
    expect(fetchAsinTermWindows).toHaveBeenCalledWith(7, specs);
    expect(fetchAdGroupShares).toHaveBeenCalledWith(7, ["A1"]);
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({
      cacheType: "seo-ppc-status-asin",
      data: { v: 2, rows: [{ asin: "A1", search_term: "y" }], shares: [{ asin: "A1", shared_with: 1 }] },
    }));
    expect(result.rows).toEqual([{ asin: "A1", search_term: "y" }]);
    expect(result.shares).toEqual([{ asin: "A1", shared_with: 1 }]);
  });

  it("empty specs and empty shareAsins → no Redshift, empty result", async () => {
    const result = await loadAsinTermWindows(7, [], []);
    expect(result).toEqual({ rows: [], shares: [], fetchedAt: expect.any(Date) });
    expect(fetchAsinTermWindows).not.toHaveBeenCalled();
    expect(fetchAdGroupShares).not.toHaveBeenCalled();
  });
});

describe("loadVersionTexts (Review Focus 3)", () => {
  it("queries by ASIN|version with the version normalised, first SKU row wins", async () => {
    createQueryJob.mockResolvedValue([{ getQueryResults: async () => [[
      { ASIN: "B0X", SEOVersionNumber: "01", SKU: "a", ItemName: "first" },
      { ASIN: "B0X", SEOVersionNumber: 1, SKU: "b", ItemName: "second" },
    ]] }]);
    const out = await loadVersionTexts([{ asin: "B0X", version: 1 }]);
    const call = createQueryJob.mock.calls[0][0];
    expect(call.query).toContain("proj.MFBibleApp.SEO");
    expect(call.query).toContain("CAST(SAFE_CAST(SEOVersionNumber AS INT64) AS STRING)");
    expect(call.params).toEqual({ keys: ["B0X|1"] });
    expect(out.get("B0X|1")?.title).toBe("first");
  });
  it("empty keys → no query", async () => {
    expect((await loadVersionTexts([])).size).toBe(0);
    expect(createQueryJob).not.toHaveBeenCalled();
  });
});
