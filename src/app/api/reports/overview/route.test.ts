import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn().mockResolvedValue({ user: { role: "admin" } }),
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuthOrCron: vi.fn().mockResolvedValue(null),
  getEffectiveAccountId: vi.fn().mockResolvedValue("1"),
}));
vi.mock("@/lib/redshift", () => ({
  queryRedshift: vi.fn(),
}));
vi.mock("@/lib/bigquery", () => ({
  queryBigQuery: vi.fn().mockResolvedValue([{ sales_goal: 0, ad_spend_goal: 0, acos_goal: 0, tacos_goal: 0, roas_goal: 0 }]),
}));
vi.mock("@/lib/reports-cache", () => ({
  getCachedReport: vi.fn(),
  setCachedReport: vi.fn(),
  buildDatedKey: vi.fn((a, s, e) => `${a}|${s}|${e}`),
}));

import { GET } from "./route";
import { getCachedReport, setCachedReport } from "@/lib/reports-cache";
import { queryRedshift } from "@/lib/redshift";
import { getEffectiveAccountId } from "@/lib/api-auth";

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/reports/overview");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

describe("GET /api/reports/overview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns cached data without calling Redshift on cache hit", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ totalSales: 42 });

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    const json = await res.json();

    expect(json).toEqual({ totalSales: 42 });
    expect(queryRedshift).not.toHaveBeenCalled();
    expect(setCachedReport).not.toHaveBeenCalled();
  });

  it("queries Redshift and writes through on cache miss", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{ total_sales: "99" }]);

    const res = await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30" }));
    expect(res.status).toBe(200);
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalledWith(
      "report-overview",
      "1|2026-04-01|2026-04-30",
      expect.any(Object),
    );
  });

  it("?refresh=true bypasses cache and re-queries Redshift", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue({ stale: true });
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{ total_sales: "99" }]);

    await GET(makeRequest({ accountId: "1", start: "2026-04-01", end: "2026-04-30", refresh: "true" }));
    expect(getCachedReport).not.toHaveBeenCalled();
    expect(queryRedshift).toHaveBeenCalled();
    expect(setCachedReport).toHaveBeenCalled();
  });

  it("binds a malicious accountId as a query parameter instead of interpolating it into SQL", async () => {
    const payload = "1; DROP TABLE intentwise_ecommerce_graph.account_summary;--";
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getEffectiveAccountId as ReturnType<typeof vi.fn>).mockResolvedValue(payload);
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{ total_sales: "0" }]);

    await GET(makeRequest({ start: "2026-04-01", end: "2026-04-30" }));

    const calls = (queryRedshift as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [sql, params] of calls) {
      // The payload must never appear in the SQL text — that would mean interpolation.
      expect(sql).not.toContain("DROP TABLE");
      expect(sql).not.toContain(payload);
      // account_id must be referenced via a bound placeholder…
      expect(sql).toMatch(/account_id\s*=\s*\$1/);
      // …and the raw value must travel in the params array, where the driver treats it as data.
      expect(Array.isArray(params)).toBe(true);
      expect(params[0]).toBe(payload);
    }
  });

  it("binds start and end as query parameters instead of quoting them into SQL", async () => {
    (getCachedReport as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getEffectiveAccountId as ReturnType<typeof vi.fn>).mockResolvedValue("42");
    (queryRedshift as ReturnType<typeof vi.fn>).mockResolvedValue([{ total_sales: "0" }]);

    await GET(makeRequest({ start: "2026-04-01", end: "2026-04-30" }));

    const calls = (queryRedshift as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [sql, params] of calls) {
      // No quoted date literals — those are the interpolation the fix removes.
      expect(sql).not.toMatch(/BETWEEN\s*'/);
      // Date range must use bound placeholders.
      expect(sql).toMatch(/BETWEEN\s*\$2\s*AND\s*\$3/);
      // Every call binds exactly [accountId, startBound, endBound].
      expect(params).toHaveLength(3);
      expect(params[0]).toBe("42");
      // Bound date strings are real date strings, never fragments of SQL.
      expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(params[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
