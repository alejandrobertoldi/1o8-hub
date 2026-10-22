import { describe, expect, it } from "vitest";
import {
  cityDisplayName,
  normalizeShipState,
  rollupOrderGeography,
  rowsWithin,
  snapshotCoverage,
  stateDisplayName,
  US_STATE_NAMES,
  type GeoTotals,
  type OrderGeographyRawRow,
} from "./order-geography";
import { US_STATE_PATHS } from "@/lib/us-map-paths";

const WINDOW = { start: "2025-09-16", end: "2026-09-15" };

function line(
  partial: Partial<OrderGeographyRawRow> & { order_id: string },
): OrderGeographyRawRow {
  return {
    state_raw: partial.state_raw ?? "CA",
    // `in` rather than `??` so a test can assert an explicitly absent value.
    city_raw: "city_raw" in partial ? partial.city_raw! : "SAN DIEGO",
    purchase_day: "purchase_day" in partial ? partial.purchase_day! : "2026-01-15",
    country: partial.country ?? "US",
    asin: partial.asin ?? "B0TEST0001",
    product_name: partial.product_name ?? "Test Soda",
    units: partial.units ?? 1,
    revenue: partial.revenue ?? "10.00",
    promo: partial.promo ?? "0.00",
    product_id: partial.product_id ?? null,
    sku: partial.sku ?? null,
    order_id: partial.order_id,
  };
}

describe("normalizeShipState", () => {
  it("passes through USPS codes regardless of casing or padding", () => {
    expect(normalizeShipState("CA")).toEqual({ kind: "state", code: "CA" });
    expect(normalizeShipState(" ca ")).toEqual({ kind: "state", code: "CA" });
    expect(normalizeShipState("Ny")).toEqual({ kind: "state", code: "NY" });
  });

  it("folds the free-text spellings a single account actually contains", () => {
    // Every one of these appears in Pura's trailing-365-day order lines.
    for (const raw of ["California", "CALIFORNIA", "california"]) {
      expect(normalizeShipState(raw)).toEqual({ kind: "state", code: "CA" });
    }
    expect(normalizeShipState("New york")).toEqual({ kind: "state", code: "NY" });
    expect(normalizeShipState("NORTH CAROLINA")).toEqual({ kind: "state", code: "NC" });
    expect(normalizeShipState("virginia")).toEqual({ kind: "state", code: "VA" });
    expect(normalizeShipState("New  Jersey")).toEqual({ kind: "state", code: "NJ" });
  });

  it("routes APO/FPO post codes to military rather than a state", () => {
    expect(normalizeShipState("AE")).toEqual({ kind: "military", code: "AE" });
    expect(normalizeShipState("ap")).toEqual({ kind: "military", code: "AP" });
    expect(normalizeShipState("AA")).toEqual({ kind: "military", code: "AA" });
  });

  it("recognises DC and Puerto Rico, which the map draws", () => {
    expect(normalizeShipState("District of Columbia")).toEqual({ kind: "state", code: "DC" });
    expect(normalizeShipState("Washington DC")).toEqual({ kind: "state", code: "DC" });
    expect(normalizeShipState("Puerto Rico")).toEqual({ kind: "state", code: "PR" });
    // "Washington" alone is the state, not the district.
    expect(normalizeShipState("Washington")).toEqual({ kind: "state", code: "WA" });
  });

  it("keeps anything it cannot place, instead of dropping the sale", () => {
    expect(normalizeShipState("Narnia")).toEqual({ kind: "unmapped", code: "Narnia" });
    expect(normalizeShipState("")).toEqual({ kind: "unmapped", code: "Unknown" });
    expect(normalizeShipState(null)).toEqual({ kind: "unmapped", code: "Unknown" });
  });
});

describe("state names and map coverage", () => {
  it("names every region the choropleth can draw", () => {
    for (const code of Object.keys(US_STATE_PATHS)) {
      expect(US_STATE_NAMES[code], `missing name for ${code}`).toBeTruthy();
    }
  });

  it("draws every region the normalizer can produce", () => {
    for (const code of Object.keys(US_STATE_NAMES)) {
      expect(US_STATE_PATHS[code], `missing path for ${code}`).toBeTruthy();
    }
  });

  it("falls back to the raw code for anything unnamed", () => {
    expect(stateDisplayName("CA")).toBe("California");
    expect(stateDisplayName("ZZ")).toBe("ZZ");
  });
});

describe("rowsWithin", () => {
  const rows = [
    line({ order_id: "old", purchase_day: "2025-09-16", revenue: "10.00" }),
    line({ order_id: "mid", purchase_day: "2026-06-01", revenue: "20.00" }),
    line({ order_id: "new", purchase_day: "2026-09-15", revenue: "30.00" }),
  ];

  it("slices a wider scan down to a shorter window, inclusive of both bounds", () => {
    expect(rowsWithin(rows, { start: "2025-09-16", end: "2026-09-15" }).map((r) => r.order_id)).toEqual([
      "old",
      "mid",
      "new",
    ]);
    expect(rowsWithin(rows, { start: "2026-06-01", end: "2026-09-15" }).map((r) => r.order_id)).toEqual([
      "mid",
      "new",
    ]);
    expect(rowsWithin(rows, { start: "2026-09-15", end: "2026-09-15" }).map((r) => r.order_id)).toEqual(["new"]);
  });

  it("drops rows with no purchase day rather than guessing", () => {
    const undated = [line({ order_id: "x", purchase_day: null })];
    expect(rowsWithin(undated, { start: "2025-01-01", end: "2026-12-31" })).toEqual([]);
  });

  it("rolls up a sliced window to the same totals as scanning it directly", () => {
    const window = { start: "2026-06-01", end: "2026-09-15" };
    const sliced = rollupOrderGeography(rowsWithin(rows, window), window);
    const direct = rollupOrderGeography(
      rows.filter((r) => r.order_id !== "old"),
      window,
    );
    expect(sliced.account).toEqual(direct.account);
    expect(sliced.states).toEqual(direct.states);
  });
});

describe("cityDisplayName", () => {
  it("title-cases the shouty city names Amazon ships", () => {
    expect(cityDisplayName("CHICAGO")).toBe("Chicago");
    expect(cityDisplayName("LAKE SAINT LOUIS")).toBe("Lake Saint Louis");
    expect(cityDisplayName("NEW YORK")).toBe("New York");
  });

  it("capitalises after hyphens, slashes and apostrophes", () => {
    expect(cityDisplayName("WINSTON-SALEM")).toBe("Winston-Salem");
    expect(cityDisplayName("COEUR D'ALENE")).toBe("Coeur D'Alene");
  });
});

describe("rollupOrderGeography", () => {
  it("counts an order once per grain, not once per line", () => {
    // One order, two products, both shipped to Texas.
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "TX", asin: "A", revenue: "10.00", units: 1 }),
        line({ order_id: "o1", state_raw: "TX", asin: "B", revenue: "5.00", units: 2 }),
      ],
      WINDOW,
    );

    expect(report.account.orders).toBe(1);
    expect(report.states.TX.orders).toBe(1);
    expect(report.states.TX.units).toBe(3);
    expect(report.states.TX.revenue).toBe(15);
    // Each product still claims the order it appeared in.
    expect(report.byAsin.A.TX.orders).toBe(1);
    expect(report.byAsin.B.TX.orders).toBe(1);
  });

  it("reconciles states, ASINs and the state x ASIN matrix to the account total", () => {
    const rows = [
      line({ order_id: "o1", state_raw: "CA", asin: "A", revenue: "34.99", units: 1 }),
      line({ order_id: "o1", state_raw: "CA", asin: "B", revenue: "26.99", units: 2 }),
      line({ order_id: "o2", state_raw: "California", asin: "A", revenue: "34.99", units: 1 }),
      line({ order_id: "o3", state_raw: "TX", asin: "A", revenue: "12.34", units: 3 }),
      line({ order_id: "o4", state_raw: "New york", asin: "B", revenue: "0.01", units: 1 }),
    ];
    const report = rollupOrderGeography(rows, WINDOW);

    const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
    const round = (n: number) => Math.round(n * 100) / 100;

    const stateRevenue = round(sum(Object.values(report.states).map((s) => s.revenue)));
    const asinRevenue = round(sum(report.asins.map((a) => a.revenue)));
    const cellRevenue = round(
      sum(Object.values(report.byAsin).flatMap((m) => Object.values(m).map((c) => c.revenue))),
    );

    expect(report.account.revenue).toBe(109.32);
    expect(stateRevenue).toBe(report.account.revenue);
    expect(asinRevenue).toBe(report.account.revenue);
    expect(cellRevenue).toBe(report.account.revenue);

    const stateUnits = sum(Object.values(report.states).map((s) => s.units));
    const asinUnits = sum(report.asins.map((a) => a.units));
    expect(report.account.units).toBe(8);
    expect(stateUnits).toBe(8);
    expect(asinUnits).toBe(8);

    // Distinct orders: an order sits in exactly one state, so state order
    // counts do sum to the account total even though ASIN counts do not.
    expect(sum(Object.values(report.states).map((s) => s.orders))).toBe(report.account.orders);
    expect(report.account.orders).toBe(4);
  });

  it("balances states + military + unmapped against the account at every grain", () => {
    // The identity that actually holds in production: the map only draws
    // states, so a bare sum of `states` is short by the off-map destinations.
    // Verified live against Pura (account 2706460, 2025-09-16..2026-09-15):
    // states $66,071.22 + AE $201.19 + AP $95.87 = account $66,368.28.
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "CA", revenue: "100.00", units: 2 }),
        line({ order_id: "o2", state_raw: "TX", revenue: "50.00", units: 1 }),
        line({ order_id: "o3", state_raw: "AE", revenue: "25.00", units: 3 }),
        line({ order_id: "o4", state_raw: "Narnia", revenue: "10.00", units: 1 }),
      ],
      WINDOW,
    );

    const offMap = [...Object.values(report.military), ...Object.values(report.unmapped)];
    const pick = (key: keyof GeoTotals) =>
      Object.values(report.states).reduce((a, s) => a + s[key], 0) +
      offMap.reduce((a, s) => a + s[key], 0);

    expect(Math.round(pick("revenue") * 100) / 100).toBe(report.account.revenue);
    expect(pick("units")).toBe(report.account.units);
    expect(pick("orders")).toBe(report.account.orders);

    // ASIN totals are nationwide, so they match the account without the
    // off-map add-back, while the state x ASIN matrix covers states only.
    expect(report.asins.reduce((a, x) => a + x.revenue, 0)).toBe(report.account.revenue);
    const matrix = Object.values(report.byAsin).flatMap((m) => Object.values(m));
    expect(matrix.reduce((a, c) => a + c.revenue, 0)).toBe(
      Object.values(report.states).reduce((a, s) => a + s.revenue, 0),
    );
  });

  it("merges the free-text spellings of one state into a single entry", () => {
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "CA", revenue: "10.00" }),
        line({ order_id: "o2", state_raw: "California", revenue: "10.00" }),
        line({ order_id: "o3", state_raw: "CALIFORNIA", revenue: "10.00" }),
      ],
      WINDOW,
    );

    expect(Object.keys(report.states)).toEqual(["CA"]);
    expect(report.states.CA.orders).toBe(3);
    expect(report.states.CA.revenue).toBe(30);
  });

  it("keeps military destinations in the account total but off the map", () => {
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "CA", revenue: "100.00" }),
        line({ order_id: "o2", state_raw: "AE", revenue: "25.00", units: 2 }),
      ],
      WINDOW,
    );

    expect(report.states.AE).toBeUndefined();
    expect(report.military.AE).toEqual({ orders: 1, units: 2, revenue: 25 });
    expect(report.account.revenue).toBe(125);
    expect(report.account.orders).toBe(2);
  });

  it("holds non-US destinations out of the account total entirely", () => {
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "CA", country: "US", revenue: "100.00" }),
        line({ order_id: "o2", state_raw: "ON", country: "CA", revenue: "40.00", units: 2 }),
      ],
      WINDOW,
    );

    // "CA" as a country is Canada, and must not land in California.
    expect(report.states.CA.revenue).toBe(100);
    expect(report.international.CA).toEqual({ orders: 1, units: 2, revenue: 40 });
    expect(report.account.revenue).toBe(100);
    expect(report.account.orders).toBe(1);
  });

  it("sums money in cents so long float chains still reconcile", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; 300 rows of it must not drift.
    const rows = Array.from({ length: 300 }, (_, i) =>
      line({ order_id: `o${i}`, revenue: i % 2 === 0 ? "0.10" : "0.20" }),
    );
    const report = rollupOrderGeography(rows, WINDOW);
    expect(report.account.revenue).toBe(45);
    expect(report.states.CA.revenue).toBe(45);
  });

  it("ranks products by revenue and names the top seller per state", () => {
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "CA", asin: "SMALL", product_name: "Small", revenue: "5.00" }),
        line({ order_id: "o2", state_raw: "CA", asin: "BIG", product_name: "Big", revenue: "50.00" }),
      ],
      WINDOW,
    );

    expect(report.asins.map((a) => a.asin)).toEqual(["BIG", "SMALL"]);
    expect(report.states.CA.topAsin).toBe("BIG");
    expect(report.states.CA.topAsinName).toBe("Big");
    expect(report.states.CA.topAsinRevenue).toBe(50);
    expect(report.states.CA.products.map((p) => p.asin)).toEqual(["BIG", "SMALL"]);
  });

  it("carries catalog identity onto the ASIN entries for the detail links", () => {
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", asin: "A", product_id: "prod-1", sku: "SKU-A" }),
        line({ order_id: "o2", asin: "B" }),
      ],
      WINDOW,
    );

    const a = report.asins.find((x) => x.asin === "A");
    expect(a?.productId).toBe("prod-1");
    expect(a?.sku).toBe("SKU-A");

    // Uncatalogued ASINs stay renderable, just without links.
    const b = report.asins.find((x) => x.asin === "B");
    expect(b?.productId).toBeNull();
    expect(b?.sku).toBeNull();
  });

  it("breaks each state down by ship-to city, revenue descending", () => {
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "CA", city_raw: "SAN DIEGO", revenue: "10.00" }),
        line({ order_id: "o2", state_raw: "CA", city_raw: "LOS ANGELES", revenue: "90.00", units: 3 }),
        line({ order_id: "o3", state_raw: "TX", city_raw: "AUSTIN", revenue: "50.00" }),
      ],
      WINDOW,
    );

    expect(report.states.CA.cities.map((c) => c.city)).toEqual(["LOS ANGELES", "SAN DIEGO"]);
    expect(report.states.CA.cities[0]).toEqual({ city: "LOS ANGELES", orders: 1, units: 3, revenue: 90 });
    expect(report.states.TX.cities.map((c) => c.city)).toEqual(["AUSTIN"]);
    // City totals reconcile to their state.
    expect(report.states.CA.cities.reduce((a, c) => a + c.revenue, 0)).toBe(report.states.CA.revenue);
  });

  it("folds city casing and spacing so one place is one row", () => {
    const report = rollupOrderGeography(
      [
        line({ order_id: "o1", state_raw: "NY", city_raw: "NEW YORK", revenue: "10.00" }),
        line({ order_id: "o2", state_raw: "NY", city_raw: "new york", revenue: "10.00" }),
        line({ order_id: "o3", state_raw: "NY", city_raw: "New  York", revenue: "10.00" }),
      ],
      WINDOW,
    );

    expect(report.states.NY.cities).toHaveLength(1);
    expect(report.states.NY.cities[0]).toEqual({ city: "NEW YORK", orders: 3, units: 3, revenue: 30 });
  });

  it("keeps a state even when the city is missing", () => {
    const report = rollupOrderGeography(
      [line({ order_id: "o1", state_raw: "CA", city_raw: null, revenue: "10.00" })],
      WINDOW,
    );
    expect(report.states.CA.revenue).toBe(10);
    expect(report.states.CA.cities).toEqual([]);
  });

  it("returns an empty but well-formed report when the account has no orders", () => {
    const report = rollupOrderGeography([], WINDOW);
    expect(report.states).toEqual({});
    expect(report.asins).toEqual([]);
    expect(report.account).toEqual({ orders: 0, units: 0, revenue: 0, promo: 0 });
    expect(report.window).toEqual(WINDOW);
  });
});

describe("snapshotCoverage", () => {
  const meta = { coveredStart: "2025-09-21", coveredEnd: "2026-09-20" };

  it("is full when the window sits inside the snapshot", () => {
    expect(snapshotCoverage(meta, "2025-09-21", "2026-09-20")).toBe("full");
    expect(snapshotCoverage(meta, "2026-06-01", "2026-06-30")).toBe("full");
  });

  it("is stale when the window ends up to three days past the snapshot", () => {
    expect(snapshotCoverage(meta, "2025-09-22", "2026-09-21")).toBe("stale");
    expect(snapshotCoverage(meta, "2025-09-24", "2026-09-23")).toBe("stale");
  });

  it("is none once the window ends more than three days past the snapshot", () => {
    expect(snapshotCoverage(meta, "2025-09-25", "2026-09-24")).toBe("none");
  });

  it("is none when the window starts before the snapshot", () => {
    expect(snapshotCoverage(meta, "2025-09-20", "2026-09-20")).toBe("none");
  });

  it("is none with no snapshot", () => {
    expect(snapshotCoverage(null, "2025-09-21", "2026-09-20")).toBe("none");
  });

  it("counts the lag across a month boundary", () => {
    const eom = { coveredStart: "2025-10-01", coveredEnd: "2026-09-30" };
    expect(snapshotCoverage(eom, "2025-10-03", "2026-10-03")).toBe("stale");
    expect(snapshotCoverage(eom, "2025-10-04", "2026-10-04")).toBe("none");
  });
});
