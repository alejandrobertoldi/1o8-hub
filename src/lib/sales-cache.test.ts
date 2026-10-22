import { describe, it, expect, vi, beforeEach } from "vitest";

const rows: { cacheKey: string; data: unknown; updatedAt: Date }[] = [];
const where = vi.fn(async () => rows);
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where }) }) } }));

import { getCachedDataMany } from "./sales-cache";

describe("getCachedDataMany", () => {
  beforeEach(() => { rows.length = 0; where.mockClear(); });

  it("returns an empty map without querying when no keys", async () => {
    expect((await getCachedDataMany("daily", [])).size).toBe(0);
    expect(where).not.toHaveBeenCalled();
  });

  it("returns fresh rows and drops ones older than 24h", async () => {
    rows.push(
      { cacheKey: "a", data: { n: 1 }, updatedAt: new Date() },
      { cacheKey: "b", data: { n: 2 }, updatedAt: new Date(Date.now() - 25 * 3600 * 1000) },
    );
    const m = await getCachedDataMany<{ n: number }>("daily", ["a", "b", "c", "a"]);
    expect(where).toHaveBeenCalledTimes(1);
    expect([...m.keys()]).toEqual(["a"]);
    expect(m.get("a")).toEqual({ n: 1 });
  });
});
