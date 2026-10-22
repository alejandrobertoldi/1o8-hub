import { describe, it, expect, beforeEach, vi } from "vitest";
import { emptyClientProductStats } from "./client-product-stats";
import {
  PRODUCT_STATS_TTL_MS,
  getProductStatsForRequest,
  invalidateClientProductStats,
  peekProductStats,
  readProductStats,
  writeProductStats,
} from "./client-product-stats-cache";

const T0 = 1_000_000;
const sample = new Map([
  ["POO_SC_US", { ...emptyClientProductStats(), count: 12, activeCount: 9 }],
]);

describe("client-product-stats-cache", () => {
  beforeEach(() => invalidateClientProductStats());

  it("misses until written", () => {
    expect(readProductStats(T0)).toBeNull();
  });

  it("hits inside the TTL and peeks after it", () => {
    writeProductStats(sample, T0);
    expect(readProductStats(T0 + PRODUCT_STATS_TTL_MS - 1)).toBe(sample);
    expect(readProductStats(T0 + PRODUCT_STATS_TTL_MS)).toBeNull();
    expect(peekProductStats()).toBe(sample);
  });

  it("serves stale immediately and refreshes in the background", async () => {
    writeProductStats(sample, T0);
    let release!: (v: typeof sample) => void;
    const fill = vi.fn(
      () =>
        new Promise<typeof sample>((res) => {
          release = res;
        }),
    );

    const result = await getProductStatsForRequest(
      fill,
      undefined,
      1_500,
      T0 + PRODUCT_STATS_TTL_MS,
    );
    expect(result).toBe(sample);
    expect(fill).toHaveBeenCalledOnce();

    const next = new Map([
      ["POO_SC_US", { ...emptyClientProductStats(), count: 99, activeCount: 99 }],
    ]);
    release(next);
    await vi.waitFor(() => {
      expect(readProductStats()).toBe(next);
    });
  });

  it("does not block a cold fill past waitMs", async () => {
    const fill = vi.fn(
      () =>
        new Promise<typeof sample>(() => {
          /* never resolves during this test */
        }),
    );

    const started = Date.now();
    const result = await getProductStatsForRequest(fill, undefined, 40);
    expect(Date.now() - started).toBeLessThan(400);
    expect(result.size).toBe(0);
    expect(fill).toHaveBeenCalledOnce();
  });

  it("calls onFilled after a successful fill", async () => {
    const onFilled = vi.fn();
    const result = await getProductStatsForRequest(
      async () => sample,
      onFilled,
      1_000,
    );
    expect(result).toBe(sample);
    expect(onFilled).toHaveBeenCalledWith(sample);
  });

  it("an in-flight fill started before invalidation does not repopulate", async () => {
    let release!: (v: typeof sample) => void;
    const fill = () =>
      new Promise<typeof sample>((res) => {
        release = res;
      });

    const pending = getProductStatsForRequest(fill, undefined, 5_000);
    invalidateClientProductStats();
    release(sample);

    await expect(pending).resolves.toBe(sample);
    expect(readProductStats()).toBeNull();
  });
});
