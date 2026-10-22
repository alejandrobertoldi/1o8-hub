import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getAuthSession = vi.fn();
vi.mock("@/lib/auth-db", () => ({ getAuthSession: () => getAuthSession() }));

const getCachedReport = vi.fn();
const setCachedReport = vi.fn();
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: (...a: unknown[]) => getCachedReport(...a),
  setCachedReport: (...a: unknown[]) => setCachedReport(...a),
}));

const fetchAvailableMonths = vi.fn();
const fetchStockRows = vi.fn();
const fetchDemand = vi.fn();
const fetchAsinList = vi.fn();
vi.mock("@/lib/fba-inventory-map/queries.server", () => ({
  fetchAvailableMonths: (...a: unknown[]) => fetchAvailableMonths(...a),
  fetchStockRows: (...a: unknown[]) => fetchStockRows(...a),
  fetchDemand: (...a: unknown[]) => fetchDemand(...a),
  fetchFcDirectory: () => Promise.resolve(new Map()),
  fetchAsinList: (...a: unknown[]) => fetchAsinList(...a),
}));

import { GET } from "../route";
import { ASINS_CACHE_TYPE, CACHE_TYPE, MONTHS_CACHE_TYPE, MONTHS_TTL_MS, PAYLOAD_TTL_MS } from "@/lib/fba-inventory-map/cache-keys";

const req = (qs: string) => new NextRequest(`http://localhost/api/reports/fba-inventory-map?${qs}`);

describe("GET /api/reports/fba-inventory-map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthSession.mockResolvedValue({ user: { role: "admin" } });
    getCachedReport.mockResolvedValue(null);
    fetchAvailableMonths.mockResolvedValue(["2026-08", "2026-07"]);
    fetchStockRows.mockResolvedValue([{ fc: "PHX7", units: 10, fee: 1 }]);
    fetchDemand.mockResolvedValue({ status: "unavailable", reason: "no_orders" });
    fetchAsinList.mockResolvedValue([{ asin: "B0TEST0001", units: 10, title: "Soda" }]);
  });

  it("401 without a session, 403 for a client", async () => {
    getAuthSession.mockResolvedValueOnce(null);
    expect((await GET(req("accountId=1"))).status).toBe(401);
    getAuthSession.mockResolvedValueOnce({ user: { role: "client" } });
    expect((await GET(req("accountId=1"))).status).toBe(403);
  });

  it("400 on missing/invalid accountId or malformed month", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req("accountId=1;drop"))).status).toBe(400);
    expect((await GET(req("accountId=1&month=2026-13"))).status).toBe(400);
    expect(fetchStockRows).not.toHaveBeenCalled();
  });

  it("defaults to the newest month and caches both keys with their TTLs", async () => {
    const json = await (await GET(req("accountId=4283010"))).json();
    expect(json.month).toBe("2026-08");
    expect(json.availableMonths).toEqual(["2026-08", "2026-07"]);
    expect(json.dots[0].key).toBe("PHX");
    expect(fetchStockRows).toHaveBeenCalledWith("4283010", "2026-08", null);
    expect(json.asins).toEqual([{ asin: "B0TEST0001", units: 10, title: "Soda" }]);
    expect(getCachedReport).toHaveBeenCalledWith(MONTHS_CACHE_TYPE, "4283010", MONTHS_TTL_MS);
    expect(getCachedReport).toHaveBeenCalledWith(CACHE_TYPE, "4283010:2026-08:all", PAYLOAD_TTL_MS);
    expect(setCachedReport).toHaveBeenCalledWith(MONTHS_CACHE_TYPE, "4283010", ["2026-08", "2026-07"]);
    expect(setCachedReport).toHaveBeenCalledWith(ASINS_CACHE_TYPE, "4283010:2026-08", json.asins);
    const payloadWrite = setCachedReport.mock.calls.find((c) => c[0] === CACHE_TYPE)!;
    expect(payloadWrite[2]).not.toHaveProperty("availableMonths");
  });

  it("asin filter: validated, upper-cased, passed to both queries, own cache key", async () => {
    expect((await GET(req("accountId=1&month=2026-08&asin=bad"))).status).toBe(400);
    const json = await (await GET(req("accountId=1&month=2026-08&asin=b0test0001"))).json();
    expect(json.asin).toBe("B0TEST0001");
    expect(fetchStockRows).toHaveBeenCalledWith("1", "2026-08", "B0TEST0001");
    expect(fetchDemand).toHaveBeenCalledWith("1", "2026-08", "B0TEST0001");
    expect(getCachedReport).toHaveBeenCalledWith(CACHE_TYPE, "1:2026-08:B0TEST0001", PAYLOAD_TTL_MS);
  });

  it("empty ASIN list is not cached", async () => {
    fetchAsinList.mockResolvedValueOnce([]);
    await GET(req("accountId=1&month=2026-08"));
    expect(setCachedReport.mock.calls.some((c) => c[0] === ASINS_CACHE_TYPE)).toBe(false);
  });

  it("cache hit: no Redshift, fresh availableMonths merged in", async () => {
    getCachedReport.mockImplementation(async (type: string) =>
      type === MONTHS_CACHE_TYPE
        ? ["2026-09", "2026-08"]
        : type === ASINS_CACHE_TYPE
          ? [{ asin: "B0TEST0001", units: 10, title: "Soda" }]
          : { dots: [], unplaced: { units: 0, share: 0, fcs: [] }, totals: { units: 5, placedUnits: 0, fee: 0 }, demand: { status: "unavailable", reason: "no_orders" }, divisions: null },
    );
    const json = await (await GET(req("accountId=1&month=2026-08"))).json();
    expect(fetchStockRows).not.toHaveBeenCalled();
    expect(fetchAvailableMonths).not.toHaveBeenCalled();
    expect(fetchAsinList).not.toHaveBeenCalled();
    expect(json.availableMonths).toEqual(["2026-09", "2026-08"]);
  });

  it("month not in availableMonths: 200, empty, not cached, months intact", async () => {
    fetchStockRows.mockResolvedValueOnce([]);
    const res = await GET(req("accountId=1&month=2019-01"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ month: "2019-01", dots: [], availableMonths: ["2026-08", "2026-07"] });
    expect(setCachedReport.mock.calls.some((c) => c[0] === CACHE_TYPE)).toBe(false);
  });

  it("account with no reports: month null, empty body, no stock query", async () => {
    fetchAvailableMonths.mockResolvedValueOnce([]);
    const json = await (await GET(req("accountId=1"))).json();
    expect(json).toMatchObject({ month: null, availableMonths: [], dots: [] });
    expect(fetchStockRows).not.toHaveBeenCalled();
  });

  it("passes demand-unavailable reasons through", async () => {
    fetchDemand.mockResolvedValueOnce({ status: "unavailable", reason: "account_not_mirrored" });
    const json = await (await GET(req("accountId=1&month=2026-08"))).json();
    expect(json.demand).toEqual({ status: "unavailable", reason: "account_not_mirrored" });
    expect(json.divisions).toBeNull();
  });

  it("empty asin param means no filter, not a 400", async () => {
    const json = await (await GET(req("accountId=1&month=2026-08&asin="))).json();
    expect(json.asin).toBeNull();
    expect(fetchStockRows).toHaveBeenCalledWith("1", "2026-08", null);
    expect(fetchDemand).toHaveBeenCalledWith("1", "2026-08", null);
  });

  it("on a double cache miss, the ASIN list and stock+demand queries run in parallel, not in series", async () => {
    const order: string[] = [];
    fetchAsinList.mockImplementationOnce(async () => {
      order.push("asins-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("asins-end");
      return [{ asin: "B0TEST0001", units: 10, title: "Soda" }];
    });
    fetchStockRows.mockImplementationOnce(async () => {
      order.push("stock-start");
      return [{ fc: "PHX7", units: 10, fee: 1 }];
    });
    await GET(req("accountId=1&month=2026-08"));
    // If the ASIN fetch ran first (serially), "stock-start" would only appear after
    // "asins-end". Running them together means stock starts before asins resolves.
    expect(order.indexOf("stock-start")).toBeLessThan(order.indexOf("asins-end"));
  });

  it("Redshift error → 502 and nothing cached", async () => {
    fetchStockRows.mockRejectedValueOnce(new Error("statement timeout"));
    const res = await GET(req("accountId=1&month=2026-08"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("statement timeout");
    expect(setCachedReport.mock.calls.some((c) => c[0] === CACHE_TYPE)).toBe(false);
  });
});
