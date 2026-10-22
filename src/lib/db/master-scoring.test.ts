import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock only the db connection (./index) so no real Postgres client is created.
// Schema and drizzle-orm stay real so getTableColumns(master) works at import time.
const { whereMock, chain } = vi.hoisted(() => {
  const whereMock = vi.fn();
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = whereMock;
  return { whereMock, chain };
});

vi.mock("./index", () => ({ db: chain }));

import { isTransientConnError, selectMasterForScoring } from "./master-scoring";

beforeEach(() => vi.clearAllMocks());

describe("isTransientConnError", () => {
  it("detects a reset code on the error itself", () => {
    expect(isTransientConnError({ code: "ECONNRESET" })).toBe(true);
  });

  it("detects a reset code on the error's cause (postgres.js wrapping)", () => {
    expect(isTransientConnError({ cause: { code: "ECONNRESET" } })).toBe(true);
  });

  it("detects other transient connection codes", () => {
    expect(isTransientConnError({ code: "ETIMEDOUT" })).toBe(true);
    expect(isTransientConnError({ cause: { code: "CONNECTION_ENDED" } })).toBe(true);
  });

  it("does not treat ordinary query errors as transient", () => {
    expect(isTransientConnError(new Error("duplicate key"))).toBe(false);
    expect(isTransientConnError({ code: "23505" })).toBe(false);
    expect(isTransientConnError(null)).toBe(false);
  });
});

describe("selectMasterForScoring", () => {
  const rows = [{ id: "p1" }];

  it("returns rows on the first successful attempt (no retry)", async () => {
    whereMock.mockResolvedValueOnce(rows);
    await expect(selectMasterForScoring(undefined)).resolves.toBe(rows);
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on a transient reset, then succeeds", async () => {
    whereMock
      .mockRejectedValueOnce({ cause: { code: "ECONNRESET" } })
      .mockResolvedValueOnce(rows);
    await expect(selectMasterForScoring(undefined)).resolves.toBe(rows);
    expect(whereMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient error", async () => {
    whereMock.mockRejectedValueOnce({ code: "23505" });
    await expect(selectMasterForScoring(undefined)).rejects.toEqual({ code: "23505" });
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after a single retry when the reset persists", async () => {
    whereMock
      .mockRejectedValueOnce({ code: "ECONNRESET" })
      .mockRejectedValueOnce({ code: "ECONNRESET" });
    await expect(selectMasterForScoring(undefined)).rejects.toEqual({ code: "ECONNRESET" });
    expect(whereMock).toHaveBeenCalledTimes(2);
  });
});
