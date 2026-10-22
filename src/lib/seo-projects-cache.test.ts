import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SEO_PROJECTS_CACHE_TTL_MS,
  getOrFillSeoProjectsCache,
  invalidateSeoProjectsCache,
  peekSeoProjectsCache,
  writeSeoProjectsCache,
} from "./seo-projects-cache";

const T0 = 1_000_000;

describe("seo-projects-cache", () => {
  beforeEach(() => invalidateSeoProjectsCache());

  it("returns a fresh fill on a cold slot", async () => {
    const fill = vi.fn().mockResolvedValue(["p1"]);
    await expect(getOrFillSeoProjectsCache(fill, T0)).resolves.toEqual(["p1"]);
    expect(fill).toHaveBeenCalledOnce();
  });

  it("does not refill inside the TTL", async () => {
    writeSeoProjectsCache(["p1"], T0);
    const fill = vi.fn().mockResolvedValue(["p2"]);
    await expect(
      getOrFillSeoProjectsCache(fill, T0 + SEO_PROJECTS_CACHE_TTL_MS - 1),
    ).resolves.toEqual(["p1"]);
    expect(fill).not.toHaveBeenCalled();
  });

  it("serves stale immediately after TTL and refreshes in the background", async () => {
    writeSeoProjectsCache(["old"], T0);
    let resolveFill: (value: string[]) => void = () => {};
    const fill = vi.fn(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFill = resolve;
        }),
    );

    const got = await getOrFillSeoProjectsCache(fill, T0 + SEO_PROJECTS_CACHE_TTL_MS);
    expect(got).toEqual(["old"]);
    expect(fill).toHaveBeenCalledOnce();

    resolveFill(["new"]);
    await vi.waitFor(() => {
      expect(peekSeoProjectsCache()).toEqual(["new"]);
    });
  });

  it("invalidate drops the slot so the next reader refills", async () => {
    writeSeoProjectsCache(["p1"], T0);
    invalidateSeoProjectsCache();
    const fill = vi.fn().mockResolvedValue(["p2"]);
    await expect(getOrFillSeoProjectsCache(fill, T0)).resolves.toEqual(["p2"]);
  });

  it("does not cache a rejected fill", async () => {
    const fill = vi.fn().mockRejectedValue(new Error("DB connection lost"));
    await expect(getOrFillSeoProjectsCache(fill, T0)).rejects.toThrow("DB connection lost");
    expect(peekSeoProjectsCache()).toBeNull();
  });
});
