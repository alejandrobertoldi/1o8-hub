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
  buildKeywordKey: vi.fn((a, s, e, k) => `${a}|${s}|${e}|${k}`),
}));

import { GET } from "./route";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { queryRedshift } from "@/lib/redshift";

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/reports/share-of-voice-keyword");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const baseParams = {
  accountId: "1",
  start: "2026-04-01",
  end: "2026-04-30",
  keyword: "dog treats",
};

describe("GET /api/reports/share-of-voice-keyword", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      brandSeries: [],
      competitorSeries: [],
    });
    const res = await GET(makeRequest(baseParams));
    expect(await res.json()).toEqual({ brandSeries: [], competitorSeries: [] });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const res = await GET(makeRequest(baseParams));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-share-of-voice-keyword",
      "1|2026-04-01|2026-04-30|dog treats",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({
      brandSeries: [],
      competitorSeries: [],
    });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await GET(makeRequest({ ...baseParams, refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });
});
