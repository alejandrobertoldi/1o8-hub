import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db", () => ({ db: { insert: vi.fn() } }));

import { logEvent, logEventAsync } from "./event-logger";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/** Mocks `db.insert(t).values(row).execute()` and exposes the captured row. */
function mockInsert(result: Promise<unknown>) {
  const values = vi.fn().mockReturnValue({ execute: vi.fn().mockReturnValue(result) });
  asMock(db.insert).mockReturnValue({ values });
  return values;
}

describe("logEventAsync", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("does not resolve until the insert settles", async () => {
    let release!: () => void;
    const pending = new Promise<void>((r) => { release = r; });
    mockInsert(pending);

    let settled = false;
    const p = logEventAsync({ section: "admin", action: "user:update" }).then(() => {
      settled = true;
    });

    // Give the microtask queue a turn. If the insert were fire-and-forget the
    // promise would already be settled here — which is the whole bug this
    // function exists to avoid.
    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    await p;
    expect(settled).toBe(true);
  });

  it("resolves rather than rejecting when the insert fails", async () => {
    mockInsert(Promise.reject(new Error("connection terminated")));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      logEventAsync({ section: "admin", action: "user:update" })
    ).resolves.toBeUndefined();

    expect(spy).toHaveBeenCalledWith(
      "[event-logger] Failed to write event:",
      "connection terminated"
    );
  });

  it("defaults status to success and every optional field to null", async () => {
    const values = mockInsert(Promise.resolve());
    await logEventAsync({ section: "admin", action: "user:update" });

    expect(values).toHaveBeenCalledWith({
      userEmail: null,
      userName: null,
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: null,
      resourceId: null,
      resourceLabel: null,
      message: null,
      detail: null,
      durationMs: null,
    });
  });

  it("passes explicit values through unchanged", async () => {
    const values = mockInsert(Promise.resolve());
    await logEventAsync({
      userEmail: "manu@marketfoundry.agency",
      userName: "Manu Lancharro",
      section: "admin",
      action: "user:update",
      status: "success",
      resourceType: "user",
      resourceId: "u2",
      resourceLabel: "jake@marketfoundry.agency",
      detail: { countryCode: "PK" },
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "manu@marketfoundry.agency",
        resourceId: "u2",
        resourceLabel: "jake@marketfoundry.agency",
        detail: { countryCode: "PK" },
      })
    );
  });
});

describe("logEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("still returns void and still triggers the insert", () => {
    const values = mockInsert(Promise.resolve());
    expect(logEvent({ section: "admin", action: "user:update" })).toBeUndefined();
    expect(values).toHaveBeenCalledTimes(1);
  });
});
