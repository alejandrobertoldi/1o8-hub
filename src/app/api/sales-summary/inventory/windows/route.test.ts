// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { role: "editor" as string } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));
const queryRedshift = vi.fn(async (sql: string) =>
  sql.includes("2025-10-01") ? [{ asin: "B0", sku: "S", units: "40" }] : [{ asin: "B0", sku: "S", units: "90" }]);
vi.mock("@/lib/redshift", () => ({ queryRedshift: (s: string) => queryRedshift(s) }));
const cache = vi.hoisted(() => ({
  get: vi.fn(async (): Promise<unknown> => null),
  set: vi.fn(async (): Promise<void> => undefined),
}));
vi.mock("@/lib/sales-cache", () => ({ getCachedData: cache.get, setCachedData: cache.set }));

import { GET, parseWindowsParams } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://x/api/sales-summary/inventory/windows?${qs}`));

describe("parseWindowsParams", () => {
  it("defaults seasonal to same quarter last year", () => {
    const r = parseWindowsParams(new URLSearchParams("accountIds=12,34&recentDays=90"), "2026-10-07");
    expect(r).toEqual({ ok: true, ids: ["12", "34"], recent: { start: "2026-07-09", end: "2026-10-07" }, seasonal: { start: "2025-10-01", end: "2025-12-31" } });
  });
  it.each([
    "accountIds=12&recentDays=90&seasonalStart=2024-10-01'--&seasonalEnd=2025-01-31",
    "accountIds=12;DROP&recentDays=90",
    "accountIds=12&recentDays=5",
    "accountIds=&recentDays=90",
  ])("rejects %s", (qs) => {
    expect(parseWindowsParams(new URLSearchParams(qs), "2026-10-07").ok).toBe(false);
  });
});

describe("GET windows", () => {
  beforeEach(() => {
    queryRedshift.mockClear();
    cache.get.mockReset().mockImplementation(async () => null);
    cache.set.mockReset().mockImplementation(async () => undefined);
    session.user.role = "editor";
  });

  it("returns units keyed asin|sku", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const res = await get("accountIds=12&recentDays=90");
    vi.useRealTimers();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.units).toEqual({ "B0|S": { recent: 90, seasonal: 40 } });
    expect(body.byAsin).toEqual({ B0: { recent: 90, seasonal: 40 } });
  });
  it("never reaches Redshift with a hostile date", async () => {
    const res = await get("accountIds=12&recentDays=90&seasonalStart=2024-10-01'%20OR%201=1%20--&seasonalEnd=2025-01-31");
    expect(res.status).toBe(400);
    expect(queryRedshift).not.toHaveBeenCalled();
  });
  it("403s clients", async () => {
    session.user.role = "client";
    expect((await get("accountIds=12&recentDays=90")).status).toBe(403);
  });

  it("still returns 200 with data when the cache read throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    cache.get.mockImplementation(async () => { throw new Error("pool exhausted"); });
    const res = await get("accountIds=12&recentDays=90");
    expect(res.status).toBe(200);
    expect((await res.json()).units["B0|S"]).toBeTruthy();
    err.mockRestore();
  });
  it("still returns 200 with data when the cache write throws", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    cache.set.mockImplementation(async () => { throw new Error("pool exhausted"); });
    const res = await get("accountIds=12&recentDays=90");
    expect(res.status).toBe(200);
    expect((await res.json()).units["B0|S"]).toBeTruthy();
    expect(cache.set).toHaveBeenCalled();
    err.mockRestore();
  });
  it("502s on a Redshift failure and never writes the cache", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    queryRedshift.mockImplementationOnce(async () => { throw new Error("timeout"); });
    const res = await get("accountIds=12&recentDays=90");
    expect(res.status).toBe(502);
    expect(cache.set).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
