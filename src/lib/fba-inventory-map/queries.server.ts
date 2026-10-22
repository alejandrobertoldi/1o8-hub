import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fulfillmentCenters, orderGeographyLines } from "@/lib/db/schema";
import { queryRedshiftOrThrow } from "@/lib/redshift";
import { getSnapshotMeta } from "@/lib/reports/order-geography-snapshot";
import { normalizeShipState } from "@/lib/reports/order-geography";
import { resolveCatalog } from "@/lib/reports/order-geography.server";
import { monthRange } from "./month";
import type { AsinOption, DemandInput, FcDirectory, StockRow } from "./types";

const T = "amazon_source_data.sellercentral_fbastoragefees_report";

/** Latest download only: an account-month re-downloaded would otherwise double count. */
export const STOCK_SQL = `
with latest as (
  select max(download_date) as d from ${T}
  where account_id = $1 and btrim(month_of_charge, '''" ') = $2
)
select btrim(fulfillment_center, '''" ')          as fc,
       sum(average_quantity_on_hand::float)       as units,
       sum(estimated_monthly_storage_fee::float)  as fee
from ${T}
where account_id = $1
  and btrim(month_of_charge, '''" ') = $2
  and download_date = (select d from latest)
  and btrim(country_code, '''" ') = 'US'
  and ($3::varchar is null or btrim(asin, '''" ') = $3)
group by 1`;

export const ASINS_SQL = `
with latest as (
  select max(download_date) as d from ${T}
  where account_id = $1 and btrim(month_of_charge, '''" ') = $2
)
select btrim(asin, '''" ') as asin, sum(average_quantity_on_hand::float) as units
from ${T}
where account_id = $1
  and btrim(month_of_charge, '''" ') = $2
  and download_date = (select d from latest)
  and btrim(country_code, '''" ') = 'US'
group by 1
order by 2 desc
limit 200`;

export const MONTHS_SQL = `
select distinct btrim(month_of_charge, '''" ') as m from ${T}
where account_id = $1 and btrim(country_code, '''" ') = 'US'
order by 1 desc limit 24`;

export async function fetchAvailableMonths(accountId: string): Promise<string[]> {
  const rows = await queryRedshiftOrThrow<{ m: string }>(MONTHS_SQL, [accountId], { timeoutMs: 60_000 });
  return rows.map((r) => r.m).filter((m) => /^\d{4}-\d{2}$/.test(m));
}

export async function fetchStockRows(accountId: string, month: string, asin: string | null): Promise<StockRow[]> {
  const rows = await queryRedshiftOrThrow<{ fc: string; units: string | number; fee: string | number }>(
    STOCK_SQL, [accountId, month, asin], { timeoutMs: 60_000 },
  );
  return rows.map((r) => ({ fc: r.fc, units: Number(r.units) || 0, fee: Number(r.fee) || 0 }));
}

export async function fetchAsinList(accountId: string, month: string): Promise<AsinOption[]> {
  const rows = await queryRedshiftOrThrow<{ asin: string; units: string | number }>(ASINS_SQL, [accountId, month], { timeoutMs: 60_000 });
  const clean = rows.filter((r) => r.asin).map((r) => ({ asin: r.asin.toUpperCase(), units: Math.round(Number(r.units) || 0) }));
  const catalog = await resolveCatalog(clean.map((r) => r.asin));
  return clean.map((r) => ({ ...r, title: catalog.get(r.asin)?.title ?? r.asin }));
}

export async function fetchDemand(accountId: string, month: string, asin: string | null): Promise<DemandInput> {
  const meta = await getSnapshotMeta(accountId);
  if (!meta) return { status: "unavailable", reason: "account_not_mirrored" };
  const { start, endExclusive } = monthRange(month);
  if (start < meta.coveredStart) return { status: "unavailable", reason: "month_outside_window" };

  const rows = await db
    .select({ state: orderGeographyLines.shipState, units: sql<number>`sum(${orderGeographyLines.units})`.mapWith(Number) })
    .from(orderGeographyLines)
    .where(and(
      eq(orderGeographyLines.accountId, accountId),
      gte(orderGeographyLines.purchaseDay, start),
      lt(orderGeographyLines.purchaseDay, endExclusive),
      asin ? eq(orderGeographyLines.asin, asin) : undefined,
    ))
    .groupBy(orderGeographyLines.shipState);

  const byState: Record<string, number> = {};
  let totalUnits = 0;
  for (const r of rows) {
    totalUnits += r.units;
    const n = normalizeShipState(r.state);
    if (n.kind === "state") byState[n.code] = (byState[n.code] ?? 0) + r.units;
  }
  if (totalUnits === 0) return { status: "unavailable", reason: "no_orders" };
  return { status: "ok", byState, totalUnits };
}

const DIRECTORY_TTL_MS = 60 * 60 * 1000;
let directoryMemo: { at: number; value: FcDirectory } | null = null;

/** Geocoded US rows of `fulfillment_centers` (~1k), memoised per server instance for an hour. */
export async function fetchFcDirectory(): Promise<FcDirectory> {
  if (directoryMemo && Date.now() - directoryMemo.at < DIRECTORY_TTL_MS) return directoryMemo.value;
  const rows = await db
    .select({
      code: fulfillmentCenters.code,
      state: fulfillmentCenters.region,
      city: fulfillmentCenters.city,
      lat: fulfillmentCenters.latitude,
      lon: fulfillmentCenters.longitude,
    })
    .from(fulfillmentCenters)
    .where(and(eq(fulfillmentCenters.country, "US"), isNotNull(fulfillmentCenters.latitude), isNotNull(fulfillmentCenters.longitude)));
  const value: FcDirectory = new Map(
    rows.map((r) => [r.code, { state: r.state, city: r.city, lat: Number(r.lat), lon: Number(r.lon) }]),
  );
  directoryMemo = { at: Date.now(), value };
  return value;
}
