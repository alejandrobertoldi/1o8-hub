import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api-auth", () => ({
  requireAuthOrCron: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  buildDatedKey: vi.fn((a, s, e) => `${a}|${s}|${e}`),
  buildAsinKey: vi.fn((a, s, e, asin) => `${a}|${s}|${e}|${asin}`),
}));

import { GET } from "./route";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { queryRedshift } from "@/lib/redshift";

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/reports/subscribe-save");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const baseParams = {
  accountId: "1",
  start: "2026-04-01",
  end: "2026-04-30",
};

describe("GET /api/reports/subscribe-save", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data on hit (no asin)", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      asins: [],
      selectedAsin: "ALL",
      data: [],
    });
    const res = await GET(makeRequest(baseParams));
    expect(await res.json()).toEqual({ asins: [], selectedAsin: "ALL", data: [] });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss (no asin)", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await GET(makeRequest(baseParams));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-subscribe-save",
      "1|2026-04-01|2026-04-30",
      expect.any(Object),
    );
  });

  it("queries Redshift and writes through on cache miss (with asin)", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await GET(makeRequest({ ...baseParams, asin: "B0ABC" }));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-subscribe-save-asin",
      "1|2026-04-01|2026-04-30|B0ABC",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache (no asin)", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      asins: [],
      selectedAsin: "ALL",
      data: [],
    });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await GET(makeRequest({ ...baseParams, refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
