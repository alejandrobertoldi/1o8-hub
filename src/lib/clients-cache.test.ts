import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CLIENTS_CACHE_TTL_MS,
  clientsCacheKey,
  getOrFillClientsCache,
  invalidateClientsCache,
  peekClientsCache,
  readClientsCache,
  writeClientsCache,
} from "./clients-cache";

const T0 = 1_000_000;

describe("clients-cache", () => {
  beforeEach(() => invalidateClientsCache());

  it("misses on a key that was never written", () => {
    expect(readClientsCache("active", T0)).toBeNull();
  });

  it("hits inside the TTL window", () => {
    writeClientsCache("active", [{ clientIdCode: "PURA" }], T0);
    expect(readClientsCache("active", T0 + CLIENTS_CACHE_TTL_MS - 1)).toEqual([
      { clientIdCode: "PURA" },
    ]);
  });

  it("misses once the TTL has elapsed", () => {
    writeClientsCache("active", ["x"], T0);
    expect(readClientsCache("active", T0 + CLIENTS_CACHE_TTL_MS)).toBeNull();
  });

  it("keeps each status filter in its own slot", () => {
    writeClientsCache("active", ["a"], T0);
    writeClientsCache("all", ["a", "i"], T0);

    expect(readClientsCache("active", T0)).toEqual(["a"]);
    expect(readClientsCache("all", T0)).toEqual(["a", "i"]);
    expect(readClientsCache("inactive", T0)).toBeNull();
  });

  it("invalidate drops every slot, not just the one last written", () => {
    writeClientsCache("active", ["a"], T0);
    writeClientsCache("all", ["a", "i"], T0);
    writeClientsCache("inactive", ["i"], T0);

    invalidateClientsCache();

    expect(readClientsCache("active", T0)).toBeNull();
    expect(readClientsCache("all", T0)).toBeNull();
    expect(readClientsCache("inactive", T0)).toBeNull();
  });

  it("a later write replaces an earlier one and restarts the TTL", () => {
    writeClientsCache("active", ["old"], T0);
    writeClientsCache("active", ["new"], T0 + CLIENTS_CACHE_TTL_MS - 1);

    expect(readClientsCache("active", T0 + CLIENTS_CACHE_TTL_MS + 1)).toEqual(["new"]);
  });

  it("clientsCacheKey keeps lite payloads off the stats slots", () => {
    expect(clientsCacheKey(null)).toBe("active");
    expect(clientsCacheKey("all")).toBe("all");
    expect(clientsCacheKey("inactive")).toBe("inactive");
    expect(clientsCacheKey(null, true)).toBe("active-lite");
    expect(clientsCacheKey("all", true)).toBe("all-lite");
    expect(clientsCacheKey("inactive", true)).toBe("inactive");
  });

  it("peek still has the payload after the TTL elapses", () => {
    writeClientsCache("active", ["x"], T0);
    expect(readClientsCache("active", T0 + CLIENTS_CACHE_TTL_MS)).toBeNull();
    expect(peekClientsCache("active")).toEqual(["x"]);
  });

  it("an expired slot is served immediately while a background fill runs", async () => {
    writeClientsCache("active", ["old"], T0);
    let release!: (v: string[]) => void;
    const fill = vi.fn(
      () => new Promise<string[]>((res) => {
        release = res;
      }),
    );

    const result = await getOrFillClientsCache(
      "active",
      fill,
      T0 + CLIENTS_CACHE_TTL_MS,
    );
    expect(result).toEqual(["old"]);
    expect(fill).toHaveBeenCalledOnce();

    release(["new"]);
    await vi.waitFor(() => {
      expect(readClientsCache("active")).toEqual(["new"]);
    });
  });

  it("an in-flight fill that started before an invalidation does not repopulate the slot", async () => {
    // The real failure: a GET already reading the DB when a section toggle wrote and
    // invalidated would resolve afterwards and re-insert its PRE-write payload, so the
    // next read served stale allowedSections for up to a minute and the toggle looked
    // like it had not persisted.
    let release!: (v: string[]) => void;
    const fill = () => new Promise<string[]>((res) => { release = res; });

    const inFlight = getOrFillClientsCache("active", fill, T0);
    invalidateClientsCache();
    release(["stale"]);

    await expect(inFlight).resolves.toEqual(["stale"]); // the caller still gets its answer
    expect(readClientsCache("active", T0)).toBeNull();  // but it is NOT cached
  });
});
