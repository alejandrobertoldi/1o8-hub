import { describe, it, expect } from "vitest";
import type { SqpRow } from "@/lib/ppc-queries";
import { rankByPurchases, groupByAsin, pickLeadAsin, lastNFullWeeks, aggregateByQuery } from "./sqp";

function row(p: Partial<SqpRow>): SqpRow {
  return {
    account_id: 1, asin: "A1", search_query: "q", search_query_volume: 0,
    asin_impression_count: 0, asin_impression_share: 0,
    asin_click_count: 0, asin_click_share: 0,
    asin_cart_add_count: 0, asin_cart_add_share: 0,
    asin_purchase_count: 0, asin_purchase_share: 0,
    start_date: "2026-04-19", end_date: "2026-06-13", ...p,
  };
}

describe("rankByPurchases", () => {
  it("sorts by purchases desc, tie-breaks on cart-adds then volume", () => {
    const out = rankByPurchases([
      row({ search_query: "low", asin_purchase_count: 1 }),
      row({ search_query: "high", asin_purchase_count: 9 }),
      row({ search_query: "tieA", asin_purchase_count: 5, asin_cart_add_count: 2, search_query_volume: 100 }),
      row({ search_query: "tieB", asin_purchase_count: 5, asin_cart_add_count: 2, search_query_volume: 500 }),
    ]);
    expect(out.map(r => r.search_query)).toEqual(["high", "tieB", "tieA", "low"]);
  });
});

describe("aggregateByQuery", () => {
  it("collapses per-week rows into one row per query, summing counts and volume", () => {
    const out = aggregateByQuery([
      row({ search_query: "charcoal", search_query_volume: 100, asin_purchase_count: 2, asin_cart_add_count: 4 }),
      row({ search_query: "charcoal", search_query_volume: 50, asin_purchase_count: 3, asin_cart_add_count: 1 }),
      row({ search_query: "first aid", search_query_volume: 999, asin_purchase_count: 1 }),
    ]);
    expect(out).toHaveLength(2);
    const charcoal = out.find((r) => r.search_query === "charcoal")!;
    expect(charcoal.asin_purchase_count).toBe(5);
    expect(charcoal.asin_cart_add_count).toBe(5);
    expect(charcoal.search_query_volume).toBe(150);
  });

  it("volume-weighted-averages the share columns and never exceeds 100", () => {
    const [agg] = aggregateByQuery([
      row({ search_query: "q", search_query_volume: 100, asin_purchase_share: 80 }),
      row({ search_query: "q", search_query_volume: 300, asin_purchase_share: 100 }),
    ]);
    // (80*100 + 100*300) / 400 = 95
    expect(agg.asin_purchase_share).toBeCloseTo(95);
    expect(agg.asin_purchase_share).toBeLessThanOrEqual(100);
  });
});

describe("groupByAsin", () => {
  it("groups rows by asin", () => {
    const g = groupByAsin([row({ asin: "A1" }), row({ asin: "A2" }), row({ asin: "A1" })]);
    expect(Object.keys(g).sort()).toEqual(["A1", "A2"]);
    expect(g.A1).toHaveLength(2);
  });
});

describe("pickLeadAsin", () => {
  it("returns the asin with the highest total purchases", () => {
    const lead = pickLeadAsin({
      A1: [row({ asin: "A1", asin_purchase_count: 2 }), row({ asin: "A1", asin_purchase_count: 3 })],
      A2: [row({ asin: "A2", asin_purchase_count: 10 })],
    });
    expect(lead).toBe("A2");
  });
  it("returns null when every total is zero", () => {
    expect(pickLeadAsin({ A1: [row({ asin: "A1", asin_purchase_count: 0 })] })).toBeNull();
  });
});

describe("lastNFullWeeks", () => {
  it("returns the last n complete Sun-Sat weeks ending on the most recent completed Saturday", () => {
    // 2026-06-16 is a Tuesday; last completed week ends Sat 2026-06-13
    const w = lastNFullWeeks(8, new Date(Date.UTC(2026, 5, 16)));
    expect(w.endDate).toBe("2026-06-13");
    expect(w.startDate).toBe("2026-04-19"); // 8 weeks back, a Sunday
  });
});

import { assembleProjectSqp, buildTitleKeywordBlock, type ProjectSqp } from "./sqp";

const WINDOW = { startDate: "2026-04-19", endDate: "2026-06-13", weeks: 8 };

describe("assembleProjectSqp", () => {
  it("filters to family ASINs, ranks per ASIN, and picks the lead ASIN", () => {
    const rows = [
      row({ asin: "A1", search_query: "charcoal for dogs", asin_purchase_count: 3 }),
      row({ asin: "A2", search_query: "dog poison kit", asin_purchase_count: 9 }),
      row({ asin: "OTHER", search_query: "noise", asin_purchase_count: 99 }), // not in family
    ];
    const out = assembleProjectSqp(["A1", "A2"], rows, WINDOW);
    expect(out.available).toBe(true);
    if (!out.available) return;
    expect(out.leadAsin).toBe("A2");
    expect(out.titleQueries[0].search_query).toBe("dog poison kit");
    expect(Object.keys(out.perAsin).sort()).toEqual(["A1", "A2"]);
  });

  it("returns no-sqp-rows when the family has no purchases", () => {
    const out = assembleProjectSqp(["A1"], [row({ asin: "A1", asin_purchase_count: 0 })], WINDOW);
    expect(out).toEqual({ available: false, reason: "no-sqp-rows" });
  });

  it("drops aggregate rows with a null/blank search_query (Redshift sends null for the totals row)", () => {
    const rows = [
      // Amazon's aggregate/redacted row: highest volume, no real query phrase
      row({ asin: "A1", search_query: null as unknown as string, search_query_volume: 234346, asin_purchase_count: 0 }),
      row({ asin: "A1", search_query: "   ", search_query_volume: 999, asin_purchase_count: 0 }),
      row({ asin: "A1", search_query: "rescue remedy for dogs", search_query_volume: 838, asin_purchase_count: 4 }),
    ];
    const out = assembleProjectSqp(["A1"], rows, WINDOW);
    expect(out.available).toBe(true);
    if (!out.available) return;
    expect(out.perAsin.A1.map((r) => r.search_query)).toEqual(["rescue remedy for dogs"]);
    expect(out.titleQueries.map((r) => r.search_query)).toEqual(["rescue remedy for dogs"]);
  });

  it("aggregates duplicate weekly rows so each phrase appears once, ranked by TOTAL purchases", () => {
    const rows = [
      // branded combo: 5+3 = 8 total purchases on tiny volume
      row({ asin: "A1", search_query: "branded combo", search_query_volume: 23, asin_purchase_count: 5 }),
      row({ asin: "A1", search_query: "branded combo", search_query_volume: 57, asin_purchase_count: 3 }),
      // generic term: 4+3 = 7 total purchases on huge volume — best single week (5) but fewer total
      row({ asin: "A1", search_query: "generic term", search_query_volume: 2214, asin_purchase_count: 4 }),
      row({ asin: "A1", search_query: "generic term", search_query_volume: 1525, asin_purchase_count: 3 }),
    ];
    const out = assembleProjectSqp(["A1"], rows, WINDOW);
    expect(out.available).toBe(true);
    if (!out.available) return;
    expect(out.perAsin.A1.map((r) => r.search_query)).toEqual(["branded combo", "generic term"]);
    expect(out.perAsin.A1[0].asin_purchase_count).toBe(8); // summed, not single-week
    expect(out.perAsin.A1[0].search_query_volume).toBe(80); // 23 + 57
    expect(out.titleQueries.map((r) => r.search_query)).toEqual(["branded combo", "generic term"]);
  });

  it("titleQueries rank the whole variation: the same phrase is summed across ALL family ASINs", () => {
    const rows = [
      row({ asin: "A1", search_query: "shared phrase", asin_purchase_count: 4 }),
      row({ asin: "A2", search_query: "shared phrase", asin_purchase_count: 5 }),
      row({ asin: "A2", search_query: "a2 only", asin_purchase_count: 6 }),
    ];
    const out = assembleProjectSqp(["A1", "A2"], rows, WINDOW);
    expect(out.available).toBe(true);
    if (!out.available) return;
    // shared phrase = 4 + 5 = 9 across the family, beats "a2 only" = 6
    expect(out.titleQueries.map((r) => r.search_query)).toEqual(["shared phrase", "a2 only"]);
    expect(out.titleQueries[0].asin_purchase_count).toBe(9);
  });

  it("drops an ASIN entirely when all its rows have null/blank queries", () => {
    const rows = [
      row({ asin: "A1", search_query: null as unknown as string, search_query_volume: 234346, asin_purchase_count: 7 }),
      row({ asin: "A2", search_query: "dog poison kit", asin_purchase_count: 9 }),
    ];
    const out = assembleProjectSqp(["A1", "A2"], rows, WINDOW);
    expect(out.available).toBe(true);
    if (!out.available) return;
    expect(out.leadAsin).toBe("A2"); // A1's only (null-query) row is gone, so it can't lead
    expect(Object.keys(out.perAsin)).toEqual(["A2"]);
  });
});

describe("buildTitleKeywordBlock", () => {
  it("uses SQP purchase-ranked queries when available", () => {
    const sqp: ProjectSqp = {
      available: true, window: WINDOW, leadAsin: "A2",
      perAsin: { A2: [row({ asin: "A2", search_query: "dog poison kit", asin_purchase_count: 9, search_query_volume: 660 })] },
      titleQueries: [row({ asin: "A2", search_query: "dog poison kit", asin_purchase_count: 9, search_query_volume: 660 })],
    };
    const block = buildTitleKeywordBlock(sqp, [{ KeywordText: "ignored", KeywordSearchVolume: 1 }]);
    expect(block).toContain("Search Query Performance");
    expect(block).toContain("dog poison kit");
    expect(block).toContain("purchases: 9");
    expect(block).not.toContain("ignored");
  });

  it("falls back to Helium 10 keywords when SQP unavailable", () => {
    const block = buildTitleKeywordBlock(
      { available: false, reason: "no-account-mapping" },
      [{ KeywordText: "dog first aid kit", KeywordSearchVolume: 8814 }]
    );
    expect(block).toContain("Helium 10");
    expect(block).toContain("dog first aid kit (SV: 8814)");
  });
});
