/**
 * Order Geography — US ship-to state x ASIN, from Seller Central order lines.
 *
 * Source is `amazon_source_data.sellercentral_ordersbydate_report`, NOT
 * `sellercentral_ordersbylastupdate_report`: the latter is an incremental
 * "recently updated" feed and holds only a few hundred of the ~1,900 orders a
 * client places in a year.
 *
 * The query is deliberately a flat GROUP BY at (order, state, ASIN) grain and
 * every rollup happens here in TS. A single-scan GROUPING SETS query with
 * COUNT(DISTINCT) over the same window timed out at 170s; the flat one returns
 * in ~54s. Keeping order IDs in the result set also means distinct order counts
 * are exact at every grain instead of being unsummable per-group aggregates.
 *
 * This module must stay free of Node-only imports: the report section is a
 * client component and imports the types and `stateDisplayName` from here. The
 * query itself lives in `order-geography.server.ts`.
 */

/** One (order, ship-state, ASIN) triple as returned by Redshift. */
export type OrderGeographyRawRow = {
  order_id: string;
  state_raw: string | null;
  city_raw: string | null;
  country: string | null;
  asin: string | null;
  product_name: string | null;
  units: number | string | null;
  revenue: number | string | null;
  promo: number | string | null;
  /** `YYYY-MM-DD` of the purchase, so one scan can be sliced into windows. */
  purchase_day?: string | null;
  /** Catalog identity, attached server-side after the scan — not from Redshift. */
  product_id?: string | null;
  sku?: string | null;
};

/**
 * Narrow an already-fetched row set to a shorter window.
 *
 * The 90- and 180-day views are subsets of the 365-day one, so the warm job
 * scans Redshift once per client and slices rather than paying for a ~70s
 * scan per preset. Dates are `YYYY-MM-DD` strings, which compare correctly
 * lexicographically and use the same inclusive bounds as the SQL.
 */
export function rowsWithin(
  rows: OrderGeographyRawRow[],
  window: { start: string; end: string },
): OrderGeographyRawRow[] {
  return rows.filter((r) => {
    const day = r.purchase_day;
    if (!day) return false;
    return day >= window.start && day <= window.end;
  });
}

/**
 * How many days a snapshot may trail the requested window and still be served.
 *
 * The snapshot job does not reach every client every day, and a snapshot one
 * day behind otherwise sends a 365-day view to a ~80s Redshift scan to fill a
 * single missing day. Serving the snapshot and leaving those days empty is the
 * better trade for an interactive page.
 */
export const SNAPSHOT_MAX_LAG_DAYS = 3;

/**
 * Whether a snapshot can serve a window: `full` when it covers it, `stale`
 * when it covers the start but ends within `SNAPSHOT_MAX_LAG_DAYS` of the
 * window's end, otherwise `none` (scan Redshift live).
 */
export function snapshotCoverage(
  meta: { coveredStart: string; coveredEnd: string } | null,
  start: string,
  end: string,
): "full" | "stale" | "none" {
  if (!meta || start < meta.coveredStart) return "none";
  if (end <= meta.coveredEnd) return "full";
  const limit = new Date(`${meta.coveredEnd}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + SNAPSHOT_MAX_LAG_DAYS);
  return end <= limit.toISOString().slice(0, 10) ? "stale" : "none";
}

export type GeoTotals = {
  orders: number;
  units: number;
  revenue: number;
};

export type StateProduct = GeoTotals & {
  asin: string;
  name: string;
};

export type CityEntry = GeoTotals & {
  city: string;
};

export type StateEntry = GeoTotals & {
  products: StateProduct[];
  /** Ship-to cities in this state, revenue descending. */
  cities: CityEntry[];
  topAsin: string | null;
  topAsinName: string | null;
  topAsinRevenue: number;
};

export type AsinEntry = GeoTotals & {
  asin: string;
  name: string;
  /** `master.id`, for the Hub product-detail link. Null when uncatalogued. */
  productId: string | null;
  sku: string | null;
};

export type OrderGeographyReport = {
  /** USPS code -> totals, mappable states only (50 + DC + PR). */
  states: Record<string, StateEntry>;
  /** ASINs sorted by revenue descending. */
  asins: AsinEntry[];
  /** ASIN -> USPS code -> totals. Drives the per-product map filter. */
  byAsin: Record<string, Record<string, GeoTotals>>;
  account: GeoTotals & { promo: number };
  /** APO/FPO codes (AA/AE/AP). In the account total, absent from the map. */
  military: Record<string, GeoTotals>;
  /** Ship-to values that matched no known state, e.g. typos. Also in totals. */
  unmapped: Record<string, GeoTotals>;
  /** Non-US ship-to country -> totals. Excluded from `account` and the map. */
  international: Record<string, GeoTotals>;
  window: { start: string; end: string };
  generatedAt: string;
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC",
  "WASHINGTON DC": "DC",
  "WASHINGTON D.C.": "DC",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "PUERTO RICO": "PR",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

/** Display names for the map tooltip, ranked list and state detail panel. */
export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
};

export function stateDisplayName(code: string): string {
  return US_STATE_NAMES[code] ?? code;
}

/**
 * Amazon ships city names in caps ("LAKE SAINT LOUIS"), which is shouty in a
 * table. Title-cased for display only — grouping still keys off the raw
 * upper-cased value so "Chicago" and "CHICAGO" stay one city.
 */
export function cityDisplayName(city: string): string {
  return city
    .toLowerCase()
    .replace(/(^|[\s\-/'])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** APO/FPO/DPO military post codes. Real destinations, but not on a US map. */
const MILITARY_CODES = new Set(["AA", "AE", "AP"]);

const VALID_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

export type NormalizedState =
  | { kind: "state"; code: string }
  | { kind: "military"; code: string }
  | { kind: "unmapped"; code: string };

/**
 * `ship_state` is free text. A single account mixes "CA", "California",
 * "CALIFORNIA", "New york" and "virginia" in the same year, so the value is
 * folded to a USPS code before anything is grouped by it.
 */
export function normalizeShipState(raw: string | null | undefined): NormalizedState {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return { kind: "unmapped", code: "Unknown" };

  const upper = cleaned.toUpperCase();

  if (MILITARY_CODES.has(upper)) return { kind: "military", code: upper };
  if (VALID_CODES.has(upper)) return { kind: "state", code: upper };

  const byName = STATE_NAME_TO_CODE[upper.replace(/\.$/, "")];
  if (byName) return { kind: "state", code: byName };

  return { kind: "unmapped", code: cleaned };
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Sales are summed in whole cents so 2,000+ float adds still reconcile. */
function toCents(v: number | string | null | undefined): number {
  return Math.round(num(v) * 100);
}

type Bucket = { orders: Set<string>; units: number; cents: number };

function bucket(): Bucket {
  return { orders: new Set(), units: 0, cents: 0 };
}

function add(b: Bucket, orderId: string, units: number, cents: number): void {
  b.orders.add(orderId);
  b.units += units;
  b.cents += cents;
}

function totals(b: Bucket): GeoTotals {
  return { orders: b.orders.size, units: b.units, revenue: b.cents / 100 };
}

/**
 * Fold order lines into the nested shape the dashboard renders.
 *
 * Distinct order counts are set cardinalities at each grain, so a state total
 * is not the sum of its per-ASIN order counts: one order carrying three
 * products counts once for the state and once for each of the three products.
 */
export function rollupOrderGeography(
  rows: OrderGeographyRawRow[],
  window: { start: string; end: string },
  generatedAt: string = new Date().toISOString(),
): OrderGeographyReport {
  const stateBuckets = new Map<string, Bucket>();
  const militaryBuckets = new Map<string, Bucket>();
  const unmappedBuckets = new Map<string, Bucket>();
  const internationalBuckets = new Map<string, Bucket>();
  const asinBuckets = new Map<string, Bucket>();
  const cellBuckets = new Map<string, Bucket>(); // `${asin}\u0000${code}`
  const stateProductBuckets = new Map<string, Bucket>(); // `${code}\u0000${asin}`
  const stateCityBuckets = new Map<string, Bucket>(); // `${code}\u0000${CITY}`
  const asinNames = new Map<string, string>();
  const asinIdentity = new Map<string, { productId: string | null; sku: string | null }>();
  const account = bucket();
  let promoCents = 0;

  const into = (m: Map<string, Bucket>, key: string): Bucket => {
    let b = m.get(key);
    if (!b) {
      b = bucket();
      m.set(key, b);
    }
    return b;
  };

  for (const row of rows) {
    const orderId = String(row.order_id ?? "");
    if (!orderId) continue;

    const units = num(row.units);
    const cents = toCents(row.revenue);
    const asin = (row.asin ?? "").trim() || "(no ASIN)";
    const name = (row.product_name ?? "").trim() || asin;

    // A non-US destination cannot be placed on this map and would silently
    // inflate the "share of total sales" every state is measured against, so
    // it is held aside rather than folded into the account total.
    const country = (row.country ?? "US").trim().toUpperCase() || "US";
    if (country !== "US") {
      add(into(internationalBuckets, country), orderId, units, cents);
      continue;
    }

    if (!asinNames.has(asin)) asinNames.set(asin, name);
    if (!asinIdentity.has(asin)) {
      asinIdentity.set(asin, { productId: row.product_id ?? null, sku: row.sku ?? null });
    }
    promoCents += toCents(row.promo);

    add(account, orderId, units, cents);
    add(into(asinBuckets, asin), orderId, units, cents);

    const state = normalizeShipState(row.state_raw);
    const target =
      state.kind === "state"
        ? stateBuckets
        : state.kind === "military"
          ? militaryBuckets
          : unmappedBuckets;
    add(into(target, state.code), orderId, units, cents);

    // Only mappable states get a per-product breakdown; military and unmapped
    // destinations stay as flat totals because nothing renders them by ASIN.
    if (state.kind === "state") {
      add(into(cellBuckets, `${asin}\u0000${state.code}`), orderId, units, cents);
      add(into(stateProductBuckets, `${state.code}\u0000${asin}`), orderId, units, cents);

      const city = (row.city_raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
      if (city) add(into(stateCityBuckets, `${state.code}\u0000${city}`), orderId, units, cents);
    }
  }

  const productsByState = new Map<string, StateProduct[]>();
  for (const [key, b] of stateProductBuckets) {
    const [code, asin] = key.split("\u0000");
    const list = productsByState.get(code) ?? [];
    list.push({ asin, name: asinNames.get(asin) ?? asin, ...totals(b) });
    productsByState.set(code, list);
  }

  const citiesByState = new Map<string, CityEntry[]>();
  for (const [key, b] of stateCityBuckets) {
    const [code, city] = key.split("\u0000");
    const list = citiesByState.get(code) ?? [];
    list.push({ city, ...totals(b) });
    citiesByState.set(code, list);
  }

  const states: Record<string, StateEntry> = {};
  for (const [code, b] of stateBuckets) {
    const products = (productsByState.get(code) ?? []).sort((a, z) => z.revenue - a.revenue);
    const top = products[0];
    states[code] = {
      ...totals(b),
      products,
      cities: (citiesByState.get(code) ?? []).sort((a, z) => z.revenue - a.revenue),
      topAsin: top?.asin ?? null,
      topAsinName: top?.name ?? null,
      topAsinRevenue: top?.revenue ?? 0,
    };
  }

  const asins: AsinEntry[] = [...asinBuckets]
    .map(([asin, b]) => ({
      asin,
      name: asinNames.get(asin) ?? asin,
      productId: asinIdentity.get(asin)?.productId ?? null,
      sku: asinIdentity.get(asin)?.sku ?? null,
      ...totals(b),
    }))
    .sort((a, z) => z.revenue - a.revenue);

  const byAsin: Record<string, Record<string, GeoTotals>> = {};
  for (const [key, b] of cellBuckets) {
    const [asin, code] = key.split("\u0000");
    (byAsin[asin] ??= {})[code] = totals(b);
  }

  const flat = (m: Map<string, Bucket>): Record<string, GeoTotals> =>
    Object.fromEntries([...m].map(([k, b]) => [k, totals(b)]));

  return {
    states,
    asins,
    byAsin,
    account: { ...totals(account), promo: promoCents / 100 },
    military: flat(militaryBuckets),
    unmapped: flat(unmappedBuckets),
    international: flat(internationalBuckets),
    window,
    generatedAt,
  };
}
