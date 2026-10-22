import { describe, it, expect } from "vitest";
import { MAX_AGE_MS, shouldServeCached } from "@/lib/sales-cache";
import { orderStalestFirst, INVENTORY_WARM_BUDGET_MS } from "@/lib/sales-warm";

/**
 * Regression guard for the 2026-10-01 "no ASIN detail in production" bug.
 *
 * Redshift inventory scans were taking 60-290s (half failing) against a 90s client
 * timeout, so the 6h warm cron only refreshed a handful of the 16 clients per run.
 * The rest aged past MAX_AGE_MS, the cache read returned null, the browser fell
 * through to a live Redshift query that timed out, and the Sales Summary metric rows
 * expanded to nothing.
 */
describe("shouldServeCached", () => {
  it("serves a fresh row to everyone", () => {
    expect(shouldServeCached(MAX_AGE_MS - 1, false)).toBe(true);
    expect(shouldServeCached(MAX_AGE_MS - 1, true)).toBe(true);
  });

  it("serves an expired row to a browser instead of a doomed live query", () => {
    expect(shouldServeCached(MAX_AGE_MS * 3, true)).toBe(true);
  });

  it("does NOT serve an expired row to the cron — it must re-query", () => {
    expect(shouldServeCached(MAX_AGE_MS + 1, false)).toBe(false);
  });
});

describe("orderStalestFirst", () => {
  const at = (iso: string) => new Date(iso);

  it("puts never-cached clients first, then oldest cache first", () => {
    const ages = new Map<string, Date>([
      ["fresh", at("2026-10-01T12:00:00Z")],
      ["old", at("2026-09-28T21:00:00Z")],
      ["mid", at("2026-09-30T06:00:00Z")],
    ]);
    const out = orderStalestFirst(["fresh", "missing", "old", "mid"], (c) => ages.get(c));
    expect(out).toEqual(["missing", "old", "mid", "fresh"]);
  });

  it("does not mutate its input", () => {
    const input = ["b", "a"];
    orderStalestFirst(input, () => undefined);
    expect(input).toEqual(["b", "a"]);
  });
});

describe("INVENTORY_WARM_BUDGET_MS", () => {
  it("leaves room for one full inventory call (120s) inside the cron's 300s", () => {
    expect(INVENTORY_WARM_BUDGET_MS + 120_000).toBeLessThan(300_000);
  });
});
