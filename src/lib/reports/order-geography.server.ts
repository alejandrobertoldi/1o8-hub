/**
 * Server half of the Order Geography report — the Redshift query.
 *
 * Split from `order-geography.ts` (which holds the types and the pure rollup)
 * because the report section is a client component: importing `queryRedshift`
 * transitively pulls `pg` into the browser bundle and the page fails to build.
 * Same split as `ai-config.ts` / `ai-config.server.ts`.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { master } from "@/lib/db/schema";
import { queryRedshiftOrThrow } from "@/lib/redshift";
import {
  rollupOrderGeography,
  type OrderGeographyRawRow,
  type OrderGeographyReport,
} from "./order-geography";

/**
 * Cancelled lines are dropped (they carry no units and distort order counts);
 * Pending ones are kept, matching how the account's own sales reporting reads.
 *
 * Note there is no de-duplication: a handful of (order, SKU) pairs legitimately
 * appear twice as split line items, and they share one `last_updated_date` and
 * one `download_date`, so they are not CDC duplicates.
 */
const ORDER_GEOGRAPHY_SQL = `
  SELECT
    amazon_order_id                          AS order_id,
    NULLIF(TRIM(ship_state), '')             AS state_raw,
    NULLIF(TRIM(ship_city), '')              AS city_raw,
    COALESCE(NULLIF(TRIM(ship_country), ''), 'US') AS country,
    asin,
    TO_CHAR(purchase_date, 'YYYY-MM-DD')     AS purchase_day,
    MAX(product_name)                        AS product_name,
    SUM(quantity)                            AS units,
    SUM(COALESCE(item_price, 0))             AS revenue,
    SUM(COALESCE(item_promotion_discount, 0)) AS promo
  FROM amazon_source_data.sellercentral_ordersbydate_report
  WHERE account_id = $1
    AND purchase_date >= $2::date
    AND purchase_date <  DATEADD(day, 1, $3::date)
    AND item_status <> 'Cancelled'
  GROUP BY 1, 2, 3, 4, 5, 6
`;

export type CatalogEntry = { title: string; productId: string | null; sku: string | null };

/**
 * Resolve each ASIN to its catalog identity: the summarized title (the display
 * title everywhere else in the app — sales summary, A+), the `master.id` behind
 * the Hub product-detail link, and the SKU.
 *
 * An ASIN can carry more than one `master` row — B0DCLWMB4Y has both
 * "30 g (Pack of 1)" and "ReadyRESCUE | 30 g (Pack of 1)" — so the longest
 * title wins rather than whichever row the query happens to return first,
 * which keeps the label stable across refreshes and picks the informative one.
 */
export async function resolveCatalog(asins: string[]): Promise<Map<string, CatalogEntry>> {
  const best = new Map<string, CatalogEntry>();
  if (asins.length === 0) return best;

  const rows = await db
    .select({
      id: master.id,
      asin: master.asin,
      sku: master.sku,
      summarizedTitle: master.summarizedTitle,
      itemName: master.itemName,
    })
    .from(master)
    .where(inArray(master.asin, asins));

  for (const row of rows) {
    if (!row.asin) continue;
    const title = (row.summarizedTitle ?? "").trim() || (row.itemName ?? "").trim();
    const current = best.get(row.asin);
    // Same longest-title rule decides which row's id and SKU are shown, so the
    // three fields always describe one catalog row rather than a mix.
    if (current && title.length <= current.title.length) continue;
    best.set(row.asin, { title, productId: row.id ?? null, sku: row.sku ?? null });
  }
  return best;
}

/**
 * The scan plus catalog enrichment, without the rollup.
 *
 * Exposed separately so the warm job can scan a client's widest window once
 * and derive the shorter presets from the same rows — 17 scans a cycle
 * instead of 51 — rather than paying ~70s per preset.
 *
 * Throws rather than yielding an empty result on failure. `queryRedshift`
 * swallows a failure into `[]`, which callers here cannot tolerate: they cache
 * for 24h, so one timed-out scan would pin "no orders" onto a healthy account
 * for a whole day. Observed in practice — account 2706460 cached an empty
 * report for a window that really holds 1,929 orders. A genuinely empty
 * account still returns `[]` and still caches, correctly; only the failure
 * case surfaces as an error for the next call to retry.
 */
export async function fetchOrderGeographyRows(
  accountId: string,
  start: string,
  end: string,
): Promise<OrderGeographyRawRow[]> {
  const rows = await queryRedshiftOrThrow<OrderGeographyRawRow>(
    ORDER_GEOGRAPHY_SQL,
    [accountId, start, end],
    // Well past the 90s default: this scan measured 47-83s healthy and has
    // exceeded 280s under load. It runs in the nightly snapshot job, which
    // can afford to wait; nothing interactive is behind it. No retry: a
    // timeout here means the warehouse is busy, and re-running the scan made
    // the 2026-09-23 cron's contention worse.
    { timeoutMs: 240_000, retry: false },
  );

  // Catalog data is presentational, so unlike the Redshift scan above an
  // outage here degrades to Amazon's raw listing names and drops the
  // product-detail links, rather than failing the whole report.
  let catalog = new Map<string, CatalogEntry>();
  try {
    catalog = await resolveCatalog([
      ...new Set(rows.map((r) => r.asin).filter((a): a is string => Boolean(a))),
    ]);
  } catch (error) {
    console.error("[order-geography] catalog lookup failed:", error);
  }

  return rows.map((row) => {
    const entry = row.asin ? catalog.get(row.asin) : undefined;
    if (!entry) return row;
    return {
      ...row,
      product_name: entry.title || row.product_name,
      product_id: entry.productId,
      sku: entry.sku,
    };
  });
}

export async function fetchOrderGeography(
  accountId: string,
  start: string,
  end: string,
): Promise<OrderGeographyReport> {
  const rows = await fetchOrderGeographyRows(accountId, start, end);
  return rollupOrderGeography(rows, { start, end });
}
