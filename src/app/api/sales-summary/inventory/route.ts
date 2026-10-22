/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { queryRedshift } from "@/lib/redshift";
import { db } from "@/lib/db";
import { master, variations } from "@/lib/db/schema";
import { inArray, eq } from "drizzle-orm";
import { getCachedEntry, setCachedData, buildInventoryCacheKey, shouldServeCached, MAX_AGE_MS } from "@/lib/sales-cache";

export const maxDuration = 120;

const RS_SCHEMA = "amazon_source_data";
const INV_TABLE = `"${RS_SCHEMA}"."sellercentral_fbamanageinventory_report"`;
const RES_TABLE = `"${RS_SCHEMA}"."sellercentral_fbareservedinventory_report"`;
const PROD_TABLE = `"intentwise_ecommerce_graph"."product_summary"`;

const HEALTH_TABLE = `"${RS_SCHEMA}"."sellercentral_fbamanageinventoryhealth_report"`;
const LISTINGS_TABLE = `"${RS_SCHEMA}"."sellercentral_alllistings_report"`;
const IMAGES_TABLE = `"${RS_SCHEMA}"."catalog_item_images"`;
const AWD_TABLE = `"${RS_SCHEMA}"."sellercentral_awd_inventory_report"`;

interface AggRow {
  period: string;
  asin: string;
  sku: string;
  product_name: string;
  // Sales metrics (SUMs)
  product_sales: number;
  product_quantity: number;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
  total_order_items: number;
  browser_session: number;
  mobile_app_session: number;
  // Inventory metrics (latest day snapshot)
  afn_fulfillable_quantity: number;
  afn_inbound_working_quantity: number;
  afn_inbound_shipped_quantity: number;
  afn_inbound_receiving_quantity: number;
  afn_reserved_quantity: number;
  afn_unsellable_quantity: number;
  afn_researching_quantity: number;
  afn_total_quantity: number;
  afn_future_supply_buyable: number;
  afn_reserved_future_supply: number;
  reserved_customerorders: number;
  reserved_fc_transfers: number;
  reserved_fc_processing: number;
  // Meta
  listing_status: string;
  main_image_link: string;
}

interface HealthRow {
  asin: string;
  sku: string;
  inv_age_0_to_90_days: string | number;
  inv_age_91_to_180_days: string | number;
  inv_age_181_to_270_days: string | number;
  inv_age_271_to_365_days: string | number;
  inv_age_365_plus_days: string | number;
  units_shipped_t7: string | number;
  units_shipped_t30: string | number;
  units_shipped_t90: string | number;
  weeks_of_cover_t30: string | number;
  sales_rank: string | number;
  inventory_supply_at_fba: string | number;
  available: string | number;
  recommended_ship_in_quantity: string | number;
  days_of_supply: string | number;
}

interface Q1Row {
  asin: string;
  sku: string;
  q1_quantity: number;
  q1_sales: number;
}

interface ProdSummaryRow {
  asin: string;
  sku: string;
  total_quantity: number;
  total_sales: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function buildPeriodCTE(
  periodName: string,
  start: string,
  end: string,
  idList: string,
) {
  // For each period, aggregate sales metrics (SUM) and inventory (latest day snapshot)
  return `
  ${periodName}_sales AS (
    SELECT
      '${periodName}' AS period,
      COALESCE(i.asin, '') AS asin,
      COALESCE(i.sku, '') AS sku,
      MAX(COALESCE(i.product_name, '')) AS product_name,
      SUM(COALESCE(p.product_sales, 0)) AS product_sales,
      SUM(COALESCE(p.product_quantity, 0)) AS product_quantity,
      SUM(COALESCE(p.ad_impressions, 0)) AS ad_impressions,
      SUM(COALESCE(p.ad_clicks, 0)) AS ad_clicks,
      SUM(COALESCE(p.ad_spend, 0)) AS ad_spend,
      SUM(COALESCE(p.ad_revenue, 0)) AS ad_revenue,
      SUM(COALESCE(p.ad_orders, 0)) AS ad_orders,
      SUM(COALESCE(p.total_order_items, 0)) AS total_order_items,
      SUM(COALESCE(p.browser_session, 0)) AS browser_session,
      SUM(COALESCE(p.mobile_app_session, 0)) AS mobile_app_session
    FROM ${INV_TABLE} i
    LEFT JOIN ${PROD_TABLE} p
      ON i.account_id = p.account_id AND i.sku = p.sku AND i.report_date = p.report_date
    WHERE i.account_id IN (${idList})
      AND i.report_date >= '${start}'::DATE
      AND i.report_date <= '${end}'::DATE
    GROUP BY i.asin, i.sku
  ),
  ${periodName}_latest_date AS (
    SELECT i.asin, i.sku, MAX(i.report_date) AS max_date
    FROM ${INV_TABLE} i
    WHERE i.account_id IN (${idList})
      AND i.report_date >= '${start}'::DATE
      AND i.report_date <= '${end}'::DATE
    GROUP BY i.asin, i.sku
  ),
  ${periodName}_inv AS (
    SELECT
      COALESCE(i.asin, '') AS asin,
      COALESCE(i.sku, '') AS sku,
      COALESCE(i.afn_fulfillable_quantity, 0) AS afn_fulfillable_quantity,
      COALESCE(i.afn_inbound_working_quantity, 0) AS afn_inbound_working_quantity,
      COALESCE(i.afn_inbound_shipped_quantity, 0) AS afn_inbound_shipped_quantity,
      COALESCE(i.afn_inbound_receiving_quantity, 0) AS afn_inbound_receiving_quantity,
      COALESCE(i.afn_reserved_quantity, 0) AS afn_reserved_quantity,
      COALESCE(i.afn_unsellable_quantity, 0) AS afn_unsellable_quantity,
      COALESCE(i.afn_researching_quantity, 0) AS afn_researching_quantity,
      COALESCE(i.afn_total_quantity, 0) AS afn_total_quantity,
      COALESCE(i.afn_future_supply_buyable, 0) AS afn_future_supply_buyable,
      COALESCE(i.afn_reserved_future_supply, 0) AS afn_reserved_future_supply,
      COALESCE(r.reserved_customerorders, 0) AS reserved_customerorders,
      COALESCE(r.reserved_fc_transfers, 0) AS reserved_fc_transfers,
      COALESCE(r.reserved_fc_processing, 0) AS reserved_fc_processing,
      COALESCE(l.status, '') AS listing_status,
      COALESCE(img.link, '') AS main_image_link
    FROM ${INV_TABLE} i
    INNER JOIN ${periodName}_latest_date ld
      ON i.asin = ld.asin AND i.sku = ld.sku AND i.report_date = ld.max_date
    LEFT JOIN ${RES_TABLE} r
      ON i.account_id = r.account_id AND i.sku = r.sku AND i.report_date = r.report_date
    LEFT JOIN ${LISTINGS_TABLE} l
      ON i.account_id = l.account_id AND i.sku = l.seller_sku AND i.report_date = l.report_date
    LEFT JOIN ${IMAGES_TABLE} img
      ON i.account_id = img.account_id AND i.asin = img.asin AND img.variant = 'MAIN'
    WHERE i.account_id IN (${idList})
  ),
  ${periodName}_combined AS (
    SELECT
      s.period,
      s.asin,
      s.sku,
      s.product_name,
      s.product_sales,
      s.product_quantity,
      s.ad_impressions,
      s.ad_clicks,
      s.ad_spend,
      s.ad_revenue,
      s.ad_orders,
      s.total_order_items,
      s.browser_session,
      s.mobile_app_session,
      COALESCE(inv.afn_fulfillable_quantity, 0) AS afn_fulfillable_quantity,
      COALESCE(inv.afn_inbound_working_quantity, 0) AS afn_inbound_working_quantity,
      COALESCE(inv.afn_inbound_shipped_quantity, 0) AS afn_inbound_shipped_quantity,
      COALESCE(inv.afn_inbound_receiving_quantity, 0) AS afn_inbound_receiving_quantity,
      COALESCE(inv.afn_reserved_quantity, 0) AS afn_reserved_quantity,
      COALESCE(inv.afn_unsellable_quantity, 0) AS afn_unsellable_quantity,
      COALESCE(inv.afn_researching_quantity, 0) AS afn_researching_quantity,
      COALESCE(inv.afn_total_quantity, 0) AS afn_total_quantity,
      COALESCE(inv.afn_future_supply_buyable, 0) AS afn_future_supply_buyable,
      COALESCE(inv.afn_reserved_future_supply, 0) AS afn_reserved_future_supply,
      COALESCE(inv.reserved_customerorders, 0) AS reserved_customerorders,
      COALESCE(inv.reserved_fc_transfers, 0) AS reserved_fc_transfers,
      COALESCE(inv.reserved_fc_processing, 0) AS reserved_fc_processing,
      COALESCE(inv.listing_status, '') AS listing_status,
      COALESCE(inv.main_image_link, '') AS main_image_link
    FROM ${periodName}_sales s
    LEFT JOIN ${periodName}_inv inv ON s.asin = inv.asin AND s.sku = inv.sku
  )`;
}

export async function GET(req: NextRequest) {
  // Allow cron refresh via CRON_SECRET bearer token
  const cronSecret = process.env.CRON_SECRET;
  const isCronRequest =
    req.headers.get("x-cron-refresh") === "true" &&
    !!cronSecret &&
    req.headers.get("authorization") === `Bearer ${cronSecret}`;

  if (isCronRequest) {
    // Cron-authenticated — proceed without session
  } else {
    const session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sp = req.nextUrl.searchParams;
  const start = sp.get("start");
  const end = sp.get("end");
  const accountIds = sp.get("accountIds");
  const prevStart = sp.get("prevStart");
  const prevEnd = sp.get("prevEnd");
  const yoyStart = sp.get("yoyStart");
  const yoyEnd = sp.get("yoyEnd");
  const mtdStart = sp.get("mtdStart");
  const mtdEnd = sp.get("mtdEnd");
  const ytdStart = sp.get("ytdStart");
  const ytdEnd = sp.get("ytdEnd");

  const refresh = sp.get("refresh") === "true";

  if (!start || !end || !accountIds) {
    return NextResponse.json({ error: "Missing start, end, or accountIds" }, { status: 400 });
  }

  const ids = accountIds.split(",").map((id) => id.trim()).filter(Boolean);
  const safeIds = ids.filter((id) => /^\d+$/.test(id));
  if (safeIds.length === 0) {
    return NextResponse.json({ products: [] });
  }

  // Check cache first (unless refresh requested)
  const cacheKey = buildInventoryCacheKey(start, end, accountIds);
  if (!refresh) {
    // Browsers get an expired row rather than a live scan: the scan routinely outlives
    // the Redshift timeout and the user sees no ASIN detail at all. The cron
    // (isCronRequest) still re-queries expired rows — see shouldServeCached.
    const cached = await getCachedEntry<{ products: unknown[] }>("inventory", cacheKey);
    if (cached && shouldServeCached(cached.ageMs, !isCronRequest)) {
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
        stale: cached.ageMs > MAX_AGE_MS,
        cachedAt: cached.updatedAt.toISOString(),
      });
    }
  }

  // Validate all date params
  const allDates = [start, end, prevStart, prevEnd, yoyStart, yoyEnd, mtdStart, mtdEnd, ytdStart, ytdEnd].filter(Boolean);
  if (allDates.some((d) => !DATE_RE.test(d!))) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const idList = safeIds.join(",");

  // Build periods - always include current, conditionally include others
  const periods: { name: string; start: string; end: string }[] = [
    { name: "current", start: start, end: end },
  ];
  if (prevStart && prevEnd) periods.push({ name: "previous", start: prevStart, end: prevEnd });
  if (yoyStart && yoyEnd) periods.push({ name: "yoy", start: yoyStart, end: yoyEnd });
  if (mtdStart && mtdEnd) periods.push({ name: "mtd", start: mtdStart, end: mtdEnd });
  if (ytdStart && ytdEnd) periods.push({ name: "ytd", start: ytdStart, end: ytdEnd });

  // Run each period as a SEPARATE query, concurrently. They are independent
  // single-period CTEs (not one giant cross-period CTE — that was the thing that
  // used to time out). The Redshift pool (max:5 in src/lib/redshift.ts) caps real
  // concurrency, and there are at most 5 periods, so peak is <=5 connections.
  // Parallelizing here cuts per-client warm time from sum(periods) to ~max(period),
  // which is what lets the refresh-sales cron fan-out finish inside maxDuration.
  try {
    const periodResults = await Promise.all(
      periods.map((p) => {
        const cte = buildPeriodCTE(p.name, p.start, p.end, idList);
        const sql = `WITH ${cte}\nSELECT * FROM ${p.name}_combined`;
        return queryRedshift<AggRow>(sql);
      }),
    );
    const rows: AggRow[] = periodResults.flat();

    // Fetch inventory health (age buckets, suggestions) — latest snapshot per ASIN/SKU
    // Uses fbamanageinventoryhealth_report (richer data than fbainventoryhealth_report)
    const healthRows = await queryRedshift<HealthRow>(`
      SELECT h.asin, h.sku,
        h.inv_age_0_to_90_days, h.inv_age_91_to_180_days,
        h.inv_age_181_to_270_days, h.inv_age_271_to_365_days,
        h.inv_age_365_plus_days,
        h.units_shipped_t7, h.units_shipped_t30,
        h.units_shipped_t90, h.weeks_of_cover_t30, h.sales_rank,
        h.inventory_supply_at_fba, h.available,
        h.recommended_ship_in_quantity, h.days_of_supply
      FROM ${HEALTH_TABLE} h
      INNER JOIN (
        SELECT account_id, asin, sku, MAX(snapshot_date) AS max_date
        FROM ${HEALTH_TABLE}
        WHERE account_id IN (${idList})
        GROUP BY account_id, asin, sku
      ) latest ON h.account_id = latest.account_id
        AND h.asin = latest.asin AND h.sku = latest.sku
        AND h.snapshot_date = latest.max_date
      WHERE h.account_id IN (${idList})
    `);

    // AWD on-hand + inbound units — latest report day per account, keyed by SKU (the report has no ASIN).
    const awdRows = await queryRedshift<{ sku: string; onhand: number; inbound: number }>(`
      SELECT a.sku, SUM(COALESCE(a.total_onhand_quantity, 0)) AS onhand,
        SUM(COALESCE(a.total_inbound_quantity, 0)) AS inbound
      FROM ${AWD_TABLE} a
      INNER JOIN (
        SELECT account_id, MAX(download_date) AS max_date
        FROM ${AWD_TABLE}
        WHERE account_id IN (${idList})
        GROUP BY account_id
      ) latest ON a.account_id = latest.account_id AND a.download_date = latest.max_date
      WHERE a.account_id IN (${idList})
      GROUP BY a.sku
    `);
    const awdMap = new Map<string, { onhand: number; inbound: number }>();
    for (const r of awdRows) awdMap.set(r.sku, { onhand: Number(r.onhand) || 0, inbound: Number(r.inbound) || 0 });

    const healthMap = new Map<string, HealthRow>();
    for (const h of healthRows) {
      healthMap.set(`${h.asin}|${h.sku}`, h);
    }

    // Fetch same-quarter from previous year (e.g. Q1 2025 if today is Q1 2026)
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    const prevYear = now.getFullYear() - 1;
    const qStartMonth = String((quarter - 1) * 3 + 1).padStart(2, "0");
    const qEndMonth = String(quarter * 3).padStart(2, "0");
    const qEndDay = [0, 31, 30, 31, 30][quarter]; // Q1=31Mar, Q2=30Jun, Q3=30Sep, Q4=31Dec
    const q1Start = `${prevYear}-${qStartMonth}-01`;
    const q1End = `${prevYear}-${qEndMonth}-${qEndDay}`;
    const q1Rows = await queryRedshift<Q1Row>(`
      SELECT p.product AS asin, p.sku,
        SUM(COALESCE(p.product_quantity, 0)) AS q1_quantity,
        SUM(COALESCE(p.product_sales, 0)) AS q1_sales
      FROM ${PROD_TABLE} p
      WHERE p.account_id IN (${idList})
        AND p.report_date >= '${q1Start}'::DATE
        AND p.report_date <= '${q1End}'::DATE
      GROUP BY p.product, p.sku
    `);

    const q1Map = new Map<string, { q1_quantity: number; q1_sales: number }>();
    for (const q of q1Rows) {
      q1Map.set(`${q.asin}|${q.sku}`, {
        q1_quantity: Number(q.q1_quantity) || 0,
        q1_sales: Number(q.q1_sales) || 0,
      });
    }

    // Fetch 30d and 90d sales from product_summary (health report is stale)
    const today = now.toISOString().slice(0, 10);
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    const d30Start = d30.toISOString().slice(0, 10);
    const d90 = new Date(now);
    d90.setDate(d90.getDate() - 90);
    const d90Start = d90.toISOString().slice(0, 10);

    const [sales30dRows, sales90dRows] = await Promise.all([
      queryRedshift<ProdSummaryRow>(`
        SELECT p.product AS asin, p.sku,
          SUM(COALESCE(p.product_quantity, 0)) AS total_quantity,
          SUM(COALESCE(p.product_sales, 0)) AS total_sales
        FROM ${PROD_TABLE} p
        WHERE p.account_id IN (${idList})
          AND p.report_date >= '${d30Start}'::DATE
          AND p.report_date <= '${today}'::DATE
        GROUP BY p.product, p.sku
      `),
      queryRedshift<ProdSummaryRow>(`
        SELECT p.product AS asin, p.sku,
          SUM(COALESCE(p.product_quantity, 0)) AS total_quantity,
          SUM(COALESCE(p.product_sales, 0)) AS total_sales
        FROM ${PROD_TABLE} p
        WHERE p.account_id IN (${idList})
          AND p.report_date >= '${d90Start}'::DATE
          AND p.report_date <= '${today}'::DATE
        GROUP BY p.product, p.sku
      `),
    ]);

    const sales30dMap = new Map<string, { units: number; sales: number }>();
    for (const r of sales30dRows) {
      sales30dMap.set(`${r.asin}|${r.sku}`, {
        units: Number(r.total_quantity) || 0,
        sales: Number(r.total_sales) || 0,
      });
    }

    const sales90dMap = new Map<string, { units: number; sales: number }>();
    for (const r of sales90dRows) {
      sales90dMap.set(`${r.asin}|${r.sku}`, {
        units: Number(r.total_quantity) || 0,
        sales: Number(r.total_sales) || 0,
      });
    }

    // Collect unique ASINs for PG lookup
    const uniqueAsins = [...new Set(rows.map((r) => r.asin).filter(Boolean))];

    const productMap = new Map<string, { productId: string; parentageLevel: string; itemName: string; summarizedTitle: string; variationName: string; mainImageUrl: string; variationId: string; parentAsin: string; color: string; size: string; flavor: string; style: string }>();
    if (uniqueAsins.length > 0) {
      const productRows = await db
        .select({
          id: master.id,
          asin: master.asin,
          parentageLevel: master.parentageLevel,
          itemName: master.itemName,
          summarizedTitle: master.summarizedTitle,
          variationName: variations.name,
          mainImageUrl: master.mainImageUrl,
          parentAsin: master.parentAsin,
          variations: master.variations,
        })
        .from(master)
        .leftJoin(variations, eq(master.variationRef, variations.id))
        .where(inArray(master.asin, uniqueAsins));

      for (const p of productRows) {
        if (!p.asin) continue;
        const v = p.variations ?? {};
        if (!productMap.has(p.asin)) {
          productMap.set(p.asin, {
            productId: p.id,
            parentageLevel: p.parentageLevel || "",
            itemName: p.itemName || "",
            summarizedTitle: p.summarizedTitle || "",
            variationName: p.variationName || "",
            mainImageUrl: p.mainImageUrl || "",
            variationId: v.VariationID ?? "",
            parentAsin: p.parentAsin || "",
            color: v.Color ?? "",
            size: v.Size ?? "",
            flavor: v.Flavor ?? "",
            style: v.Style ?? "",
          });
        }
      }
    }

    // Group rows by product, then by period
    type PeriodData = {
      product_sales: number;
      units_sold: number;
      ad_impressions: number;
      ad_clicks: number;
      ad_spend: number;
      ad_revenue: number;
      ad_orders: number;
      total_order_items: number;
      browser_session: number;
      mobile_app_session: number;
      available: number;
      inbound_quantity: number;
      reserved_quantity: number;
      reserved_customerorders: number;
      reserved_fc_transfers: number;
      reserved_fc_processing: number;
      unfulfillable_quantity: number;
      researching_quantity: number;
      fba_total_quantity: number;
      future_supply_buyable: number;
      reserved_future_supply: number;
    };

    type HealthData = {
      age_0_90: number;
      age_91_180: number;
      age_181_270: number;
      age_271_365: number;
      age_365_plus: number;
      shipped_7d: number;
      shipped_30d: number;
      shipped_90d: number;
      weeks_of_cover: number | null;
      sales_rank: number | null;
      total_quantity: number;
      sellable_quantity: number;
      recommend_ship_in: number;
    };

    type ProductAgg = {
      asin: string;
      sku: string;
      product_id: string;
      parentage_level: string;
      product_name: string;
      summarized_title: string;
      variation_name: string;
      main_image_url: string;
      listing_status: string;
      variation_id: string;
      parent_asin: string;
      color: string;
      size: string;
      flavor: string;
      style: string;
      health: HealthData | null;
      awd_onhand: number;
      awd_inbound: number;
      q1_quantity: number;
      q1_sales: number;
      units_30d: number;
      sales_30d: number;
      units_90d: number;
      sales_90d: number;
      current: PeriodData | null;
      previous: PeriodData | null;
      yoy: PeriodData | null;
      mtd: PeriodData | null;
      ytd: PeriodData | null;
    };

    const productAggs = new Map<string, ProductAgg>();

    for (const r of rows) {
      const key = `${r.asin}|${r.sku}`;
      const prod = productMap.get(r.asin);
      const inbound =
        (Number(r.afn_inbound_working_quantity) || 0) +
        (Number(r.afn_inbound_shipped_quantity) || 0) +
        (Number(r.afn_inbound_receiving_quantity) || 0);

      if (!productAggs.has(key)) {
        const h = healthMap.get(key);
        const healthData: HealthData | null = h
          ? {
              age_0_90: Number(h.inv_age_0_to_90_days) || 0,
              age_91_180: Number(h.inv_age_91_to_180_days) || 0,
              age_181_270: Number(h.inv_age_181_to_270_days) || 0,
              age_271_365: Number(h.inv_age_271_to_365_days) || 0,
              age_365_plus: Number(h.inv_age_365_plus_days) || 0,
              shipped_7d: Number(h.units_shipped_t7) || 0,
              shipped_30d: Number(h.units_shipped_t30) || 0,
              shipped_90d: Number(h.units_shipped_t90) || 0,
              weeks_of_cover: h.weeks_of_cover_t30 ? Number(h.weeks_of_cover_t30) : null,
              sales_rank: h.sales_rank ? Number(h.sales_rank) : null,
              total_quantity: Number(h.inventory_supply_at_fba) || 0,
              sellable_quantity: Number(h.available) || 0,
              recommend_ship_in: Number(h.recommended_ship_in_quantity) || 0,
            }
          : null;
        const q1 = q1Map.get(key);
        const s30 = sales30dMap.get(key);
        const s90 = sales90dMap.get(key);

        productAggs.set(key, {
          asin: r.asin,
          sku: r.sku,
          product_id: prod?.productId || "",
          parentage_level: prod?.parentageLevel || "",
          product_name: prod?.itemName || r.product_name,
          summarized_title: prod?.summarizedTitle || "",
          variation_name: prod?.variationName || "",
          main_image_url: r.main_image_link || prod?.mainImageUrl || "",
          listing_status: r.listing_status || "",
          variation_id: prod?.variationId || "",
          parent_asin: prod?.parentAsin || "",
          color: prod?.color || "",
          size: prod?.size || "",
          flavor: prod?.flavor || "",
          style: prod?.style || "",
          health: healthData,
          awd_onhand: awdMap.get(r.sku)?.onhand ?? 0,
          awd_inbound: awdMap.get(r.sku)?.inbound ?? 0,
          q1_quantity: q1?.q1_quantity ?? 0,
          q1_sales: q1?.q1_sales ?? 0,
          units_30d: s30?.units ?? 0,
          sales_30d: s30?.sales ?? 0,
          units_90d: s90?.units ?? 0,
          sales_90d: s90?.sales ?? 0,
          current: null,
          previous: null,
          yoy: null,
          mtd: null,
          ytd: null,
        });
      }

      const agg = productAggs.get(key)!;
      // Keep latest listing status from current period
      if (r.period === "current" && r.listing_status) {
        agg.listing_status = r.listing_status;
      }

      const periodData: PeriodData = {
        product_sales: Number(r.product_sales) || 0,
        units_sold: Number(r.product_quantity) || 0,
        ad_impressions: Number(r.ad_impressions) || 0,
        ad_clicks: Number(r.ad_clicks) || 0,
        ad_spend: Number(r.ad_spend) || 0,
        ad_revenue: Number(r.ad_revenue) || 0,
        ad_orders: Number(r.ad_orders) || 0,
        total_order_items: Number(r.total_order_items) || 0,
        browser_session: Number(r.browser_session) || 0,
        mobile_app_session: Number(r.mobile_app_session) || 0,
        available: Number(r.afn_fulfillable_quantity) || 0,
        inbound_quantity: inbound,
        reserved_quantity: Number(r.afn_reserved_quantity) || 0,
        reserved_customerorders: Number(r.reserved_customerorders) || 0,
        reserved_fc_transfers: Number(r.reserved_fc_transfers) || 0,
        reserved_fc_processing: Number(r.reserved_fc_processing) || 0,
        unfulfillable_quantity: Number(r.afn_unsellable_quantity) || 0,
        researching_quantity: Number(r.afn_researching_quantity) || 0,
        fba_total_quantity: Number(r.afn_total_quantity) || 0,
        future_supply_buyable: Number(r.afn_future_supply_buyable) || 0,
        reserved_future_supply: Number(r.afn_reserved_future_supply) || 0,
      };

      const period = r.period as keyof Pick<ProductAgg, "current" | "previous" | "yoy" | "mtd" | "ytd">;
      if (period in agg) {
        agg[period] = periodData;
      }
    }

    const response = { products: Array.from(productAggs.values()) };

    // Write to cache after the response — never fire-and-forget, or the write is
    // abandoned when Vercel freezes the sandbox and pins a Supavisor pool slot.
    after(async () => {
      try {
        await setCachedData("inventory", cacheKey, response);
      } catch (err) {
        console.error("Failed to write inventory cache:", err);
      }
    });

    return NextResponse.json({ ...response, fromCache: false });
  } catch (err) {
    console.error("Inventory query error:", err);
    return NextResponse.json(
      { error: "Failed to fetch inventory data" },
      { status: 500 }
    );
  }
}
