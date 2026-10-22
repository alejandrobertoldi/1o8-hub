import { describe, it, expect } from "vitest";
import type { SearchTermTotalRow } from "@/lib/ppc-queries";
import {
  normalizeTerm, computeWindows, toMetrics, aggregateByTerm,
  buildKeywordSet, buildSectionA, buildSectionB,
  parseLiveDate, sectionATotals, buildAsinBlockRows,
} from "./ppc-status";

const row = (term: string, o: Partial<SearchTermTotalRow> = {}): SearchTermTotalRow => ({
  search_term: term, is_asin: false,
  ad_impressions: 100, ad_clicks: 10, ad_spend: 5, ad_revenue: 20, ad_orders: 1,
  ...o,
});

describe("normalizeTerm", () => {
  it("lowercases, trims, collapses whitespace", () => {
    expect(normalizeTerm("  Dog   Bed\tLarge ")).toBe("dog bed large");
  });
});

describe("computeWindows", () => {
  it("no date → only gap window of last N days ending yesterday", () => {
    const w = computeWindows(null, 30, "2026-09-28");
    expect(w.status).toBe("no-date");
    expect(w.before).toBeNull();
    expect(w.after).toBeNull();
    expect(w.gapWindow).toEqual({ start: "2026-08-29", end: "2026-09-27", days: 30 });
  });
  it("live 2026-08-01, N=30 → symmetric windows", () => {
    const w = computeWindows("2026-08-01", 30, "2026-09-28");
    expect(w.status).toBe("live");
    expect(w.before).toEqual({ start: "2026-07-02", end: "2026-07-31", days: 30 });
    expect(w.after).toEqual({ start: "2026-08-01", end: "2026-08-30", days: 30 });
    expect(w.gapWindow).toEqual(w.after);
  });
  it("after window clamps to yesterday", () => {
    const w = computeWindows("2026-09-20", 30, "2026-09-28");
    expect(w.after).toEqual({ start: "2026-09-20", end: "2026-09-27", days: 8 });
  });
  it("live date = today → after window has 0 days", () => {
    const w = computeWindows("2026-09-28", 30, "2026-09-28");
    expect(w.status).toBe("live");
    expect(w.after!.days).toBe(0);
  });
  it("future live date → before/after null", () => {
    const w = computeWindows("2026-10-15", 30, "2026-09-28");
    expect(w.status).toBe("future");
    expect(w.before).toBeNull();
    expect(w.after).toBeNull();
  });
});

describe("toMetrics", () => {
  it("coerces strings (Redshift numerics) and computes roas", () => {
    const m = toMetrics([
      row("a", { ad_spend: "12.50" as unknown as number, ad_revenue: "50" as unknown as number }),
      row("b", { ad_spend: 2.5, ad_revenue: 10 }),
    ]);
    expect(m.spend).toBe(15);
    expect(m.sales).toBe(60);
    expect(m.roas).toBe(4);
  });
  it("zero spend → roas null", () => {
    expect(toMetrics([row("a", { ad_spend: 0 })]).roas).toBeNull();
  });
});

describe("aggregateByTerm", () => {
  it("groups by normalized term and drops ASIN targets", () => {
    const m = aggregateByTerm([row("Dog Bed"), row("dog  bed"), row("b0abc12345", { is_asin: true })]);
    expect([...m.keys()]).toEqual(["dog bed"]);
    expect(m.get("dog bed")!.clicks).toBe(20);
  });
});

describe("buildKeywordSet", () => {
  it("uses S6 when present, dedupes across ASINs and casing", () => {
    const r = buildKeywordSet({
      s6: [{ asin: "A1", keywords: ["Dog Bed", "orthopedic"] }, { asin: "A2", keywords: ["dog bed"] }],
      s2: [{ text: "dog bed", tier: "T1", searchVolume: 5000, suggestedBid: 1.2 }],
    });
    expect(r.source).toBe("listing");
    const dog = r.entries.find((e) => e.keyword === "dog bed")!;
    expect(dog.asins).toEqual(["A1", "A2"]);
    expect(dog.tier).toBe("T1");
    expect(dog.searchVolume).toBe(5000);
    expect(r.entries).toHaveLength(2);
  });
  it("falls back to S2 when S6 has no keywords", () => {
    const r = buildKeywordSet({ s6: [{ asin: "A1", keywords: [] }], s2: [{ text: "Cat Tree", tier: "T2", searchVolume: 10, suggestedBid: null }] });
    expect(r.source).toBe("research");
    expect(r.entries.map((e) => e.keyword)).toEqual(["cat tree"]);
  });
});

describe("buildSectionA", () => {
  const before = { start: "2026-07-02", end: "2026-07-31", days: 30 };
  const after = { start: "2026-08-01", end: "2026-08-10", days: 10 };
  const entries = [{ keyword: "dog bed", tier: "T1", asins: ["A1"], searchVolume: null, suggestedBid: null }];
  it("per-day averages use each window's own day count", () => {
    const [r] = buildSectionA(entries, [row("dog bed", { ad_clicks: 30 })], [row("Dog Bed", { ad_clicks: 30 })], before, after);
    expect(r.before!.clicks).toBe(1);
    expect(r.after!.clicks).toBe(3);
  });
  it("zero-day window → perDay null, no NaN", () => {
    const [r] = buildSectionA(entries, [], [], before, { start: "2026-08-01", end: "2026-07-31", days: 0 });
    expect(r.after).toBeNull();
    expect(r.afterTotals.clicks).toBe(0);
  });
});

describe("buildSectionB", () => {
  it("splits into noTraffic / missing (orders ≥ 1) / both", () => {
    const entries = [
      { keyword: "dog bed", tier: "T1", asins: [], searchVolume: 1, suggestedBid: null },
      { keyword: "pet mat", tier: "T2", asins: [], searchVolume: 1, suggestedBid: null },
    ];
    const b = buildSectionB(entries, [
      row("dog bed"),
      row("large dog bed", { ad_orders: 3 }),
      row("dog pillow", { ad_orders: 0 }),
    ]);
    expect(b.noTraffic.map((e) => e.keyword)).toEqual(["pet mat"]);
    expect(b.missing.map((m) => m.searchTerm)).toEqual(["large dog bed"]);
    expect(b.bothCount).toBe(1);
  });

  // M1: noTraffic must be sorted by searchVolume desc, nulls last — 584
  // uncapped rows in insertion order was "close to unusable" per review.
  it("noTraffic sorted by searchVolume desc, nulls last", () => {
    const entries = [
      { keyword: "low vol", tier: null, asins: [], searchVolume: 100, suggestedBid: null },
      { keyword: "no vol", tier: null, asins: [], searchVolume: null, suggestedBid: null },
      { keyword: "high vol", tier: null, asins: [], searchVolume: 9000, suggestedBid: null },
      { keyword: "mid vol", tier: null, asins: [], searchVolume: 500, suggestedBid: null },
    ];
    // no rows at all → every entry has 0 impressions → all noTraffic
    const b = buildSectionB(entries, []);
    expect(b.noTraffic.map((e) => e.keyword)).toEqual(["high vol", "mid vol", "low vol", "no vol"]);
  });
});

describe("sectionATotals", () => {
  const before = { start: "2026-07-02", end: "2026-07-31", days: 30 };
  const after = { start: "2026-08-01", end: "2026-08-10", days: 10 };

  it("sums beforeTotals/afterTotals across rows and per-day-averages by each window's own day count", () => {
    const rows = buildSectionA(
      [
        { keyword: "dog bed", tier: "T1", asins: ["A1"], searchVolume: null, suggestedBid: null },
        { keyword: "cat tree", tier: "T2", asins: ["A2"], searchVolume: null, suggestedBid: null },
      ],
      [row("dog bed", { ad_clicks: 30, ad_spend: 10, ad_revenue: 40 }), row("cat tree", { ad_clicks: 60, ad_spend: 20, ad_revenue: 20 })],
      [row("dog bed", { ad_clicks: 10, ad_spend: 5, ad_revenue: 25 }), row("cat tree", { ad_clicks: 20, ad_spend: 5, ad_revenue: 5 })],
      before,
      after,
    );
    const totals = sectionATotals(rows, before, after);
    expect(totals.beforeTotals).toEqual({ impressions: 200, clicks: 90, spend: 30, sales: 60, orders: 2, roas: 2 });
    expect(totals.afterTotals).toEqual({ impressions: 200, clicks: 30, spend: 10, sales: 30, orders: 2, roas: 3 });
    // per-day: 90 clicks / 30 before-days = 3; 30 clicks / 10 after-days = 3
    expect(totals.before!.clicks).toBe(3);
    expect(totals.after!.clicks).toBe(3);
  });

  it("empty rows → zeroed totals, no NaN/roas division by zero", () => {
    const totals = sectionATotals([], before, after);
    expect(totals.beforeTotals).toEqual({ impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0, roas: null });
    expect(totals.after!.clicks).toBe(0);
  });
});

describe("parseLiveDate", () => {
  it("accepts YYYY-MM-DD, null, empty", () => {
    expect(parseLiveDate("2026-08-01")).toEqual({ ok: true, value: "2026-08-01" });
    expect(parseLiveDate(null)).toEqual({ ok: true, value: null });
    expect(parseLiveDate("")).toEqual({ ok: true, value: null });
  });
  it("rejects impossible or malformed dates", () => {
    expect(parseLiveDate("2026-02-30").ok).toBe(false);
    expect(parseLiveDate("08/01/2026").ok).toBe(false);
    expect(parseLiveDate(20260801).ok).toBe(false);
  });

  // I1: Chromium fires a change event on every complete-looking date while
  // typing a year digit by digit (e.g. "0002-08-01"), and the old 4-digit
  // regex accepted it. The server must refuse junk however the UI sends it.
  it("rejects years outside 2000-2100 (partial-keystroke years)", () => {
    expect(parseLiveDate("0002-08-01").ok).toBe(false);
    expect(parseLiveDate("0020-08-01").ok).toBe(false);
    expect(parseLiveDate("0202-08-01").ok).toBe(false);
    expect(parseLiveDate("1999-12-31").ok).toBe(false);
    expect(parseLiveDate("2101-01-01").ok).toBe(false);
  });
  it("accepts the boundary years 2000 and 2100", () => {
    expect(parseLiveDate("2000-01-01")).toEqual({ ok: true, value: "2000-01-01" });
    expect(parseLiveDate("2100-12-31")).toEqual({ ok: true, value: "2100-12-31" });
  });
});

describe("buildAsinBlockRows", () => {
  const before = { start: "2026-05-03", end: "2026-06-01", days: 30 };
  const after = { start: "2026-06-02", end: "2026-07-01", days: 30 };
  const r = (search_term: string, win: "before" | "after", ad_revenue: number, ad_orders = 1) =>
    ({ asin: "A1", search_term, win, ad_impressions: 30, ad_clicks: 3, ad_spend: 6, ad_revenue, ad_orders });

  it("splits before/after per tracked keyword, per day, sorted by after sales desc", () => {
    const out = buildAsinBlockRows(
      [{ keyword: "dog kit", tier: "T1", fields: ["T"] }, { keyword: "charcoal", tier: "T2", fields: ["B", "K"] }],
      [r("Dog Kit", "before", 30), r("dog kit", "after", 60), r("charcoal", "after", 90), r("unrelated", "after", 999)],
      before, after,
    );
    expect(out.map((x) => x.keyword)).toEqual(["charcoal", "dog kit"]);
    expect(out[1].beforeTotals.sales).toBe(30);
    expect(out[1].after).toEqual({ impressions: 1, clicks: 0.1, spend: 0.2, sales: 2, orders: 1 / 30 });
    expect(out[0].fields).toEqual(["B", "K"]);
    expect(out[0].before).toEqual({ impressions: 0, clicks: 0, spend: 0, sales: 0, orders: 0 });
  });
  it("empty after window (live today) → after null (Review Focus 4)", () => {
    const out = buildAsinBlockRows([{ keyword: "x", tier: null, fields: ["T"] }], [], before, { start: "2026-09-29", end: "2026-09-28", days: 0 });
    expect(out[0].after).toBeNull();
    expect(out[0].afterTotals.sales).toBe(0);
  });
  it("tracked 'first-aid kit' counts a Redshift search term 'first aid kit' (M1 fix)", () => {
    const out = buildAsinBlockRows(
      [{ keyword: "first aid kit", tier: "T1", fields: ["T"] }],
      [r("first-aid kit", "after", 45)],
      before, after,
    );
    expect(out[0].afterTotals.sales).toBe(45);
  });
});
