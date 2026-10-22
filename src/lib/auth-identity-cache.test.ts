import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getOrFillAuthIdentity,
  patchAuthIdentity,
  invalidateAuthIdentities,
} from "./auth-identity-cache";

type Row = { id: string; role: string };

const ROW: Row = { id: "u1", role: "owner" };
const OTHER: Row = { id: "u1", role: "viewer" };

/** Real timers with tiny windows — the stale race is a setTimeout, not a clock read. */
const FAST = { staleAfterMs: 20, staleCeilingMs: 60_000, ttlMs: 10_000 };

const later = <T>(value: T, ms: number) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

// Every test uses a distinct email: the maps are module scope, and `inFlight`
// entries from a previous test would otherwise be adopted by the next one.
let n = 0;
const nextEmail = () => `user${++n}@example.com`;

beforeEach(() => {
  invalidateAuthIdentities();
});

describe("getOrFillAuthIdentity", () => {
  it("runs one fill for concurrent callers", async () => {
    const email = nextEmail();
    const fill = vi.fn(async () => later(ROW, 10));

    const [a, b, c] = await Promise.all([
      getOrFillAuthIdentity(email, fill, { now: 1000 }),
      getOrFillAuthIdentity(email, fill, { now: 1000 }),
      getOrFillAuthIdentity(email, fill, { now: 1000 }),
    ]);

    expect(fill).toHaveBeenCalledTimes(1);
    expect(a).toBe(ROW);
    expect(b).toBe(ROW);
    expect(c).toBe(ROW);
  });

  it("serves a fresh row inside the TTL without calling the fill", async () => {
    const email = nextEmail();
    const fill = vi.fn(async () => ROW);

    await getOrFillAuthIdentity(email, fill, { now: 1000, ttlMs: 10_000 });
    const again = await getOrFillAuthIdentity(email, fill, { now: 9_999, ttlMs: 10_000 });

    expect(fill).toHaveBeenCalledTimes(1);
    expect(again).toBe(ROW);
  });

  it("refills once the TTL has elapsed", async () => {
    const email = nextEmail();
    const fill = vi.fn(async () => ROW);

    await getOrFillAuthIdentity(email, fill, { now: 1000, ttlMs: 10_000 });
    await getOrFillAuthIdentity(email, fill, { now: 11_000, ttlMs: 10_000 });

    expect(fill).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejection — the next caller retries", async () => {
    const email = nextEmail();
    const failing = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });

    await expect(
      getOrFillAuthIdentity(email, failing, { now: 1000 }),
    ).rejects.toThrow("ECONNRESET");

    const ok = vi.fn(async () => ROW);
    await expect(getOrFillAuthIdentity(email, ok, { now: 1000 })).resolves.toBe(ROW);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("returns the last-known-good row when the refresh rejects", async () => {
    const email = nextEmail();
    patchAuthIdentity(email, ROW, 1000);

    const failing = async () => {
      throw new Error("ECONNRESET");
    };
    // TTL expired, well inside the ceiling.
    const got = await getOrFillAuthIdentity(email, failing, { ...FAST, now: 20_000 });

    expect(got).toBe(ROW);
  });

  it("returns the last-known-good row when the refresh outruns the stale window", async () => {
    const email = nextEmail();
    patchAuthIdentity(email, ROW, 1000);

    const slow = vi.fn(async () => later(OTHER, 200));
    const got = await getOrFillAuthIdentity(email, slow, { ...FAST, now: 20_000 });

    // Stale served immediately rather than waiting 200ms.
    expect(got).toBe(ROW);

    // The abandoned refresh still lands, so the next caller gets the new row.
    await later(null, 250);
    const after = await getOrFillAuthIdentity(email, slow, { ...FAST, now: 20_000 });
    expect(after).toBe(OTHER);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("keeps waiting past the stale window when there is no row to fall back on", async () => {
    const email = nextEmail();
    const slow = async () => later(ROW, 60);

    const got = await getOrFillAuthIdentity(email, slow, { ...FAST, now: 1000 });

    expect(got).toBe(ROW);
  });

  it("will not serve a row older than the ceiling", async () => {
    const email = nextEmail();
    patchAuthIdentity(email, ROW, 1000);

    const slow = async () => later(OTHER, 60);
    // now - storedAt exceeds staleCeilingMs, so the fallback is off the table.
    const got = await getOrFillAuthIdentity(email, slow, {
      ...FAST,
      staleCeilingMs: 5_000,
      now: 20_000,
    });

    expect(got).toBe(OTHER);
  });

  it("never stores a null result", async () => {
    const email = nextEmail();
    const missing = vi.fn(async () => null);

    await getOrFillAuthIdentity(email, missing, { now: 1000 });
    const found = vi.fn(async () => ROW);
    const got = await getOrFillAuthIdentity(email, found, { now: 1000 });

    expect(found).toHaveBeenCalledTimes(1);
    expect(got).toBe(ROW);
  });
});

describe("invalidateAuthIdentities", () => {
  it("drops memoised rows so the next caller refills", async () => {
    const email = nextEmail();
    const fill = vi.fn(async () => ROW);

    await getOrFillAuthIdentity(email, fill, { now: 1000 });
    invalidateAuthIdentities();
    await getOrFillAuthIdentity(email, fill, { now: 1000 });

    expect(fill).toHaveBeenCalledTimes(2);
  });
});
