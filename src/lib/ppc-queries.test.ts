import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock is hoisted above plain consts → create mocks with vi.hoisted.
const { queryRedshiftOrThrow } = vi.hoisted(() => ({
  queryRedshiftOrThrow: vi.fn(),
}));

vi.mock("@/lib/redshift", () => ({
  queryRedshiftOrThrow,
  queryRedshift: vi.fn(),
}));

import { fetchSearchTermTotals, fetchAsinTermWindows, fetchAdGroupShares } from "./ppc-queries";

beforeEach(() => {
  queryRedshiftOrThrow.mockReset();
});

describe("fetchSearchTermTotals", () => {
  it("calls queryRedshiftOrThrow with params and retry:false, SQL grouped and filtered", async () => {
    queryRedshiftOrThrow.mockResolvedValue([{ search_term: "x", is_asin: false, ad_impressions: 1, ad_clicks: 1, ad_spend: 1, ad_revenue: 1, ad_orders: 1 }]);

    const rows = await fetchSearchTermTotals(7, "2026-08-01", "2026-08-30");

    expect(rows).toEqual([{ search_term: "x", is_asin: false, ad_impressions: 1, ad_clicks: 1, ad_spend: 1, ad_revenue: 1, ad_orders: 1 }]);
    expect(queryRedshiftOrThrow).toHaveBeenCalledTimes(1);
    const [sql, params, options] = queryRedshiftOrThrow.mock.calls[0];
    expect(params).toEqual([7, "2026-08-01", "2026-08-30"]);
    expect(options).toEqual({ retry: false });
    expect(sql).toContain("GROUP BY search_term");
    expect(sql).toContain("NOT is_asin");
    // M7: a NULL search_term would otherwise group + cache successfully, then
    // throw inside buildSectionB's normalizeTerm(null) on every read for 24h.
    expect(sql).toContain("search_term IS NOT NULL");
  });

  it("propagates a rejected queryRedshiftOrThrow", async () => {
    queryRedshiftOrThrow.mockRejectedValue(new Error("timeout"));
    await expect(fetchSearchTermTotals(7, "2026-08-01", "2026-08-30")).rejects.toThrow("timeout");
  });
});

describe("fetchAsinTermWindows", () => {
  it("passes one UNION ALL row per ASIN (Redshift rejects VALUES in a CTE) and no retry", async () => {
    queryRedshiftOrThrow.mockResolvedValueOnce([]);
    await fetchAsinTermWindows(1899670, [
      { asin: "A1", before: { start: "2026-05-03", end: "2026-06-01" }, after: { start: "2026-06-02", end: "2026-07-01" } },
      { asin: "A2", before: { start: "2026-08-30", end: "2026-09-28" }, after: { start: "2026-09-29", end: "2026-09-28" } },
    ]);
    const [sqlText, params, opts] = queryRedshiftOrThrow.mock.calls.at(-1)!;
    // Live Redshift: `WITH w(...) AS (VALUES ...)` → syntax error at or near "VALUES" (2026-09-30).
    expect(sqlText).not.toMatch(/\bVALUES\b/);
    expect(sqlText).toContain(
      "SELECT $2::varchar AS asin, $3::date AS before_start, $4::date AS before_end, $5::date AS after_start, $6::date AS after_end" +
        " UNION ALL SELECT $7::varchar, $8::date, $9::date, $10::date, $11::date",
    );
    expect(sqlText).toContain("ad_sponsoredproducts_productads");
    expect(sqlText).toContain("NOT st.is_asin");
    expect(sqlText).toContain("st.search_term IS NOT NULL");
    // Overall bound (min start → max end) lets Redshift prune by report_date; without it: 92s read timeout.
    expect(sqlText).toContain("st.report_date BETWEEN $12::date AND $13::date");
    expect(params).toEqual([1899670, "A1", "2026-05-03", "2026-06-01", "2026-06-02", "2026-07-01", "A2", "2026-08-30", "2026-09-28", "2026-09-29", "2026-09-28", "2026-05-03", "2026-09-28"]);
    expect(opts).toEqual({ retry: false });
  });
  it("no specs → no query", async () => {
    queryRedshiftOrThrow.mockClear();
    expect(await fetchAsinTermWindows(1, [])).toEqual([]);
    expect(queryRedshiftOrThrow).not.toHaveBeenCalled();
  });
});

describe("fetchAdGroupShares", () => {
  it("self-joins productads by ad group and filters to the given ASINs", async () => {
    queryRedshiftOrThrow.mockResolvedValueOnce([{ asin: "A1", shared_with: 2 }]);
    const out = await fetchAdGroupShares(7, ["A1", "A2"]);
    const [sqlText, params] = queryRedshiftOrThrow.mock.calls.at(-1)!;
    expect(sqlText).toContain("b.asin <> a.asin");
    expect(sqlText).toContain("a.asin IN ($2, $3)");
    expect(params).toEqual([7, "A1", "A2"]);
    expect(out).toEqual([{ asin: "A1", shared_with: 2 }]);
  });
  it("O3: LEFT JOIN so every ADVERTISED ASIN returns a row (0 when its ad groups are solo); unadvertised ASINs return none", async () => {
    queryRedshiftOrThrow.mockResolvedValueOnce([]);
    await fetchAdGroupShares(7, ["A1"]);
    const [sqlText] = queryRedshiftOrThrow.mock.calls.at(-1)!;
    expect(sqlText).toContain("LEFT JOIN pa b ON b.ag = a.ag AND b.asin <> a.asin");
    expect(sqlText).toContain("COUNT(DISTINCT b.asin) AS shared_with");
  });
});
