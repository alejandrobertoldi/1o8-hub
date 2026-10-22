import { describe, it, expect } from "vitest";
import type { KeywordRow } from "./keywords";
import type { CampaignRow } from "./campaigns";
import {
  keywordToMetricRow, campaignToMetricRow, productToMetricRow, ntbPctFrom,
  roasBandOf, acosBandOf,
  filterRows, sortRows, computeTotals, toCsv, type MetricRow, type CsvColumn,
} from "./table-derivations";

const kw = (o: Partial<KeywordRow>): KeywordRow => ({
  keyword: "k", campaignType: "SP", matchType: "BROAD", isBrand: false,
  adSpend: 0, adRevenue: 0, adClicks: 0, adConversions: 0, adImpressions: 0,
  acos: 0, roas: 0, cpc: 0, ctr: 0, cvr: 0, ...o,
});
const mr = (o: Partial<MetricRow>): MetricRow => ({
  name: "r", adSpend: 0, adRevenue: 0, acos: 0, roas: 0, avgCpc: 0,
  impressions: 0, clicks: 0, conversions: 0, cvr: 0,
  orders: 0, units: 0, ntbOrders: 0, ntbPct: 0, ...o,
});

describe("row mappers", () => {
  it("keywordToMetricRow remaps field names", () => {
    const r = keywordToMetricRow(kw({ keyword: "shoes", cpc: 1.5, adImpressions: 100, adClicks: 20, adConversions: 4, matchType: "EXACT" }));
    expect(r.name).toBe("shoes");
    expect(r.avgCpc).toBe(1.5);
    expect(r.impressions).toBe(100);
    expect(r.clicks).toBe(20);
    expect(r.conversions).toBe(4);
    expect(r.matchType).toBe("EXACT");
  });
  it("campaignToMetricRow uses campaignName, falling back to em-dash", () => {
    const base: CampaignRow = { campaignName: "Brand", adSpend: 5, adRevenue: 20, acos: 25, roas: 4, avgCpc: 0.5, impressions: 9, clicks: 3, conversions: 1, cvr: 33, orders: 8, ntbOrders: 2, ntbPct: 25 };
    expect(campaignToMetricRow(base).name).toBe("Brand");
    expect(campaignToMetricRow(base).ntbPct).toBe(25);
    expect(campaignToMetricRow({ ...base, campaignName: undefined }).name).toBe("—");
  });
  it("campaignToMetricRow recomputes ntbPct when cached payloads omit it", () => {
    const base: CampaignRow = { campaignName: "Brand", adSpend: 5, adRevenue: 20, acos: 25, roas: 4, avgCpc: 0.5, impressions: 9, clicks: 3, conversions: 1, cvr: 33, orders: 10, ntbOrders: 4 };
    expect(campaignToMetricRow(base).ntbPct).toBe(40);
  });
  it("productToMetricRow uses ASIN as name and title as subtitle", () => {
    const r = productToMetricRow({
      asin: "B001", productTitle: "Iced Tea", adSpend: 10, adRevenue: 40,
      acos: 25, roas: 4, impressions: 100, clicks: 20, conversions: 8, cvr: 40,
      orders: 6, units: 8,
    });
    expect(r.name).toBe("B001");
    expect(r.subtitle).toBe("Iced Tea");
    expect(r.orders).toBe(6);
    expect(r.units).toBe(8);
    expect(r.adRevenue).toBe(40);
  });
});

describe("ntbPctFrom", () => {
  it("is ntb orders ÷ orders × 100", () => {
    expect(ntbPctFrom(2, 8)).toBe(25);
  });
  it("returns 0 when orders are 0", () => {
    expect(ntbPctFrom(2, 0)).toBe(0);
  });
});

describe("band helpers (zero-revenue ACoS → none)", () => {
  it("roasBandOf mirrors classifyRoas", () => {
    expect(roasBandOf(5)).toBe("good");
    expect(roasBandOf(3)).toBe("warn");
    expect(roasBandOf(1)).toBe("bad");
    expect(roasBandOf(0)).toBe("none");
  });
  it("acosBandOf treats 0 (zero-revenue) as none, not good", () => {
    expect(acosBandOf(0)).toBe("none");
    expect(acosBandOf(20)).toBe("good");
    expect(acosBandOf(40)).toBe("warn");
    expect(acosBandOf(80)).toBe("bad");
  });
});

describe("filterRows", () => {
  const rows = [
    mr({ name: "Alpha", matchType: "BROAD", roas: 5, acos: 20 }),
    mr({ name: "beta", matchType: "EXACT", roas: 1, acos: 80 }),
    mr({ name: "Gamma", matchType: "BROAD", roas: 3, acos: 40 }),
  ];
  it("search is case-insensitive on name", () => {
    expect(filterRows(rows, { search: "ALPHA" }).map((r) => r.name)).toEqual(["Alpha"]);
  });
  it("search also matches subtitle (ASIN title)", () => {
    const withTitle = [mr({ name: "B001", subtitle: "Halfday Peach Tea" }), mr({ name: "B002", subtitle: "Lemonade" })];
    expect(filterRows(withTitle, { search: "peach" }).map((r) => r.name)).toEqual(["B001"]);
  });
  it("matchType filter (all = passthrough)", () => {
    expect(filterRows(rows, { matchType: "BROAD" }).map((r) => r.name)).toEqual(["Alpha", "Gamma"]);
    expect(filterRows(rows, { matchType: "all" })).toHaveLength(3);
  });
  it("roasBand + acosBand predicates compose (AND)", () => {
    expect(filterRows(rows, { roasBand: "good" }).map((r) => r.name)).toEqual(["Alpha"]);
    expect(filterRows(rows, { acosBand: "bad" }).map((r) => r.name)).toEqual(["beta"]);
    expect(filterRows(rows, { matchType: "BROAD", roasBand: "warn" }).map((r) => r.name)).toEqual(["Gamma"]);
  });
});

describe("sortRows", () => {
  const rows = [mr({ name: "a", adSpend: 10 }), mr({ name: "b", adSpend: 30 }), mr({ name: "c", adSpend: 20 })];
  it("desc + asc by numeric key", () => {
    expect(sortRows(rows, "adSpend", "desc").map((r) => r.name)).toEqual(["b", "c", "a"]);
    expect(sortRows(rows, "adSpend", "asc").map((r) => r.name)).toEqual(["a", "c", "b"]);
  });
  it("is stable for equal values (preserves input order)", () => {
    const eq = [mr({ name: "x", roas: 4 }), mr({ name: "y", roas: 4 }), mr({ name: "z", roas: 4 })];
    expect(sortRows(eq, "roas", "desc").map((r) => r.name)).toEqual(["x", "y", "z"]);
  });
});

describe("computeTotals", () => {
  it("sums additives and recomputes ratios from the sums", () => {
    const rows = [
      mr({ adSpend: 10, adRevenue: 40, clicks: 20, conversions: 4, impressions: 100 }),
      mr({ adSpend: 30, adRevenue: 30, clicks: 30, conversions: 3, impressions: 200 }),
    ];
    const t = computeTotals(rows);
    expect(t.name).toBe("Total");
    expect(t.adSpend).toBe(40);
    expect(t.adRevenue).toBe(70);
    expect(t.impressions).toBe(300);
    expect(t.roas).toBeCloseTo(70 / 40, 6);
    expect(t.acos).toBeCloseTo((40 / 70) * 100, 6);
    expect(t.avgCpc).toBeCloseTo(40 / 50, 6);
    expect(t.cvr).toBeCloseTo((7 / 50) * 100, 6);
  });
  it("recomputes overall NTB % from summed orders, not an average of percents", () => {
    const rows = [
      mr({ orders: 10, ntbOrders: 2, ntbPct: 20 }),
      mr({ orders: 30, ntbOrders: 15, ntbPct: 50 }),
    ];
    const t = computeTotals(rows);
    expect(t.orders).toBe(40);
    expect(t.ntbOrders).toBe(17);
    expect(t.ntbPct).toBeCloseTo((17 / 40) * 100, 6);
  });
  it("sums advertised units and orders", () => {
    const rows = [
      mr({ orders: 4, units: 6 }),
      mr({ orders: 1, units: 2 }),
    ];
    const t = computeTotals(rows);
    expect(t.orders).toBe(5);
    expect(t.units).toBe(8);
  });
  it("guards divide-by-zero and empty input", () => {
    const t = computeTotals([]);
    expect(t.adSpend).toBe(0);
    expect(t.roas).toBe(0);
    expect(t.acos).toBe(0);
    expect(t.avgCpc).toBe(0);
    expect(t.cvr).toBe(0);
    expect(t.ntbPct).toBe(0);
    expect(t.orders).toBe(0);
    expect(t.units).toBe(0);
  });
});

describe("toCsv", () => {
  const cols: CsvColumn[] = [
    { header: "Keyword", value: (r) => r.name },
    { header: "Ad Spend", value: (r) => r.adSpend },
  ];
  it("emits a header row then one line per row, CRLF-joined", () => {
    const csv = toCsv(cols, [mr({ name: "shoes", adSpend: 12.5 })]);
    expect(csv).toBe("Keyword,Ad Spend\r\nshoes,12.5");
  });
  it("RFC-4180 quotes fields containing comma, quote, or newline", () => {
    const csv = toCsv(cols, [mr({ name: 'a,"b"\nc', adSpend: 1 })]);
    expect(csv).toBe('Keyword,Ad Spend\r\n"a,""b""\nc",1');
  });
  it("header-only when no rows", () => {
    expect(toCsv(cols, [])).toBe("Keyword,Ad Spend");
  });
});
