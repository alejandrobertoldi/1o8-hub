/**
 * Local snapshot of Seller Central order lines for Order Geography.
 *
 * The Redshift source is an external datashare we cannot tune — a 365-day
 * `COUNT(*)` for one account alone costs ~72s, and the report query has
 * exceeded 280s under load. So the interactive path reads Postgres and a
 * nightly job does the slow scan. See
 * drizzle/migrations/0113_order_geography_snapshot.sql for the measurements.
 *
 * Reading Postgres also makes arbitrary custom date ranges fast, where the
 * old cron could only pre-warm a fixed set of presets.
 */
import { and, asc, eq, gte, inArray, lte, sql as raw } from "drizzle-orm";
import { db, sqlClient } from "@/lib/db";
import { aac, orderGeographyLines, orderGeographySnapshots } from "@/lib/db/schema";
import { intentwiseFromRaw, parseRawData } from "@/lib/api-auth";
import { rollupOrderGeography, type OrderGeographyRawRow, type OrderGeographyReport } from "./order-geography";
import { fetchOrderGeographyRows, resolveCatalog } from "./order-geography.server";
import { widestTrailingWindow } from "./trailing-range";
import { pickStalestAccounts } from "./order-geography-stalest";

/**
 * The accounts the snapshot job keeps warm: every Active AAC client with an
 * Intentwise ID — the same ID the portal resolves a client user to. The
 * hub dropdown's hardcoded list missed four Active clients (ELK, HAL, MIS,
 * SOP), which scanned Redshift on every view.
 */
export async function listSnapshotAccountIds(): Promise<string[]> {
  const rows = await db
    .select({ rawData: aac.rawData })
    .from(aac)
    .where(eq(aac.clientStatus, "Active"));
  const ids = rows
    .map((r) => intentwiseFromRaw(parseRawData(r.rawData)))
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)].sort();
}

/** The `limit` Active accounts whose snapshot is missing or oldest — see pickStalestAccounts. */
export async function listStalestSnapshotAccountIds(limit: number): Promise<string[]> {
  const ids = await listSnapshotAccountIds();
  if (ids.length === 0) return [];
  const rows = await db
    .select({ accountId: orderGeographySnapshots.accountId, refreshedAt: orderGeographySnapshots.refreshedAt })
    .from(orderGeographySnapshots)
    .where(inArray(orderGeographySnapshots.accountId, ids));
  const refreshedAt = new Map(rows.map((r) => [r.accountId, r.refreshedAt]));
  return pickStalestAccounts(ids, refreshedAt, new Date(), limit);
}

/** Accounts this instance is already refreshing, so repeat views don't stack scans. */
const refreshing = new Set<string>();

/**
 * Rebuild one account's snapshot over the widest trailing window, skipping it
 * when this instance already has that refresh in flight. Never throws — it
 * runs after the response is sent, where nobody can handle the error.
 */
export async function refreshSnapshotQuietly(accountId: string): Promise<void> {
  if (refreshing.has(accountId)) return;
  refreshing.add(accountId);
  try {
    await refreshOrderGeographySnapshot(accountId, widestTrailingWindow());
  } catch (error) {
    console.error(`[order-geography] background refresh failed for ${accountId}:`, error);
  } finally {
    refreshing.delete(accountId);
  }
}

/** JSON-array inserts stay well under Postgres parameter limits. */
const INSERT_CHUNK = 4000;

export type SnapshotMeta = {
  accountId: string;
  coveredStart: string;
  coveredEnd: string;
  lineCount: number;
  refreshedAt: Date;
};

/**
 * Replace one account's snapshot with a fresh Redshift scan.
 *
 * Delete-then-insert inside a transaction so a reader never sees a partially
 * rewritten account: a half-written snapshot would render as a real but wrong
 * report rather than as an error.
 */
export async function refreshOrderGeographySnapshot(
  accountId: string,
  window: { start: string; end: string },
): Promise<{ lineCount: number }> {
  const rows = await fetchOrderGeographyRows(accountId, window.start, window.end);

  const values = rows
    .filter((r) => r.order_id && r.purchase_day)
    .map((r) => ({
      accountId,
      orderId: String(r.order_id),
      purchaseDay: String(r.purchase_day),
      shipState: r.state_raw ?? null,
      shipCity: r.city_raw ?? null,
      shipCountry: (r.country ?? "US").slice(0, 8),
      asin: (r.asin ?? "").slice(0, 32),
      units: Math.round(Number(r.units ?? 0)) || 0,
      revenue: String(r.revenue ?? "0"),
      promo: String(r.promo ?? "0"),
    }));

  console.log(`[order-geography] ${accountId} scanned ${values.length} lines, writing snapshot`);

  const conn = await sqlClient.reserve();
  try {
    await conn`set statement_timeout = 0`;
    await conn`begin`;
    try {
      // Two writers for one account (the cron and a page view's background
      // refresh) would each delete then insert, and under READ COMMITTED the
      // second delete cannot see the first's new rows, so both sets survive
      // and every total doubles. Serialise writers per account.
      await conn`select pg_advisory_xact_lock(hashtext(${"order-geography:" + accountId}))`;
      await conn`delete from order_geography_lines where account_id = ${accountId}`;
      for (let i = 0; i < values.length; i += INSERT_CHUNK) {
        const chunk = values.slice(i, i + INSERT_CHUNK).map((v) => ({
          account_id: v.accountId,
          order_id: v.orderId,
          purchase_day: v.purchaseDay,
          ship_state: v.shipState,
          ship_city: v.shipCity,
          ship_country: v.shipCountry,
          asin: v.asin,
          units: v.units,
          revenue: v.revenue,
          promo: v.promo,
        }));
        await conn`
          insert into order_geography_lines (
            account_id, order_id, purchase_day, ship_state, ship_city,
            ship_country, asin, units, revenue, promo
          )
          select
            account_id,
            order_id,
            purchase_day::date,
            ship_state,
            ship_city,
            ship_country,
            asin,
            units,
            revenue::numeric,
            promo::numeric
          from json_to_recordset(${JSON.stringify(chunk)}::json) as x(
            account_id text,
            order_id text,
            purchase_day text,
            ship_state text,
            ship_city text,
            ship_country text,
            asin text,
            units integer,
            revenue text,
            promo text
          )
        `;
        const written = Math.min(i + INSERT_CHUNK, values.length);
        if (written === values.length || written % 20000 === 0) {
          console.log(`[order-geography] ${accountId} wrote ${written}/${values.length}`);
        }
      }
      await conn`
        insert into order_geography_snapshots
          (account_id, covered_start, covered_end, line_count, refreshed_at)
        values
          (${accountId}, ${window.start}::date, ${window.end}::date, ${values.length}, now())
        on conflict (account_id) do update set
          covered_start = excluded.covered_start,
          covered_end = excluded.covered_end,
          line_count = excluded.line_count,
          refreshed_at = excluded.refreshed_at
      `;
      await conn`commit`;
    } catch (error) {
      try {
        await conn`rollback`;
      } catch {
        /* already aborted */
      }
      throw error;
    }
  } finally {
    conn.release();
  }

  return { lineCount: values.length };
}

export async function getSnapshotMeta(accountId: string): Promise<SnapshotMeta | null> {
  const [row] = await db
    .select()
    .from(orderGeographySnapshots)
    .where(eq(orderGeographySnapshots.accountId, accountId))
    .limit(1);
  if (!row) return null;
  return {
    accountId: row.accountId,
    coveredStart: String(row.coveredStart),
    coveredEnd: String(row.coveredEnd),
    lineCount: row.lineCount,
    refreshedAt: new Date(row.refreshedAt),
  };
}

/**
 * Build the report for a window out of the snapshot.
 *
 * Catalog identity is resolved here rather than stored, so a product retitled
 * in the catalog shows up on the next page load instead of the next snapshot.
 */
export async function readOrderGeographyFromSnapshot(
  accountId: string,
  start: string,
  end: string,
): Promise<OrderGeographyReport> {
  const lines = await db
    .select({
      orderId: orderGeographyLines.orderId,
      purchaseDay: orderGeographyLines.purchaseDay,
      shipState: orderGeographyLines.shipState,
      shipCity: orderGeographyLines.shipCity,
      shipCountry: orderGeographyLines.shipCountry,
      asin: orderGeographyLines.asin,
      units: orderGeographyLines.units,
      revenue: orderGeographyLines.revenue,
      promo: orderGeographyLines.promo,
    })
    .from(orderGeographyLines)
    .where(
      and(
        eq(orderGeographyLines.accountId, accountId),
        gte(orderGeographyLines.purchaseDay, start),
        lte(orderGeographyLines.purchaseDay, end),
      ),
    )
    .orderBy(asc(orderGeographyLines.purchaseDay));

  const asins = [...new Set(lines.map((l) => l.asin).filter(Boolean))];
  let catalog = new Map<string, { title: string; productId: string | null; sku: string | null }>();
  try {
    catalog = await resolveCatalog(asins);
  } catch (error) {
    console.error("[order-geography] catalog lookup failed:", error);
  }

  const rows: OrderGeographyRawRow[] = lines.map((l) => {
    const entry = catalog.get(l.asin);
    return {
      order_id: l.orderId,
      state_raw: l.shipState,
      city_raw: l.shipCity,
      country: l.shipCountry,
      asin: l.asin,
      purchase_day: String(l.purchaseDay),
      product_name: entry?.title || l.asin,
      product_id: entry?.productId ?? null,
      sku: entry?.sku ?? null,
      units: l.units,
      revenue: l.revenue,
      promo: l.promo,
    };
  });

  return rollupOrderGeography(rows, { start, end });
}

/** Accounts with a snapshot, oldest first — the order a nightly job should refresh in. */
export async function staleSnapshotAccounts(): Promise<string[]> {
  const rows = await db
    .select({ accountId: orderGeographySnapshots.accountId })
    .from(orderGeographySnapshots)
    .orderBy(asc(orderGeographySnapshots.refreshedAt));
  return rows.map((r) => r.accountId);
}

/** Total stored lines, for the snapshot job's own reporting. */
export async function snapshotLineTotal(): Promise<number> {
  const [row] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(orderGeographyLines);
  return row?.n ?? 0;
}
