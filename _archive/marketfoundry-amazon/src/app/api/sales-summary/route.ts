/* eslint-disable react-doctor/no-giant-component */
/* eslint-disable react-doctor/js-set-map-lookups */
/* eslint-disable react-doctor/js-flatmap-filter */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse, after } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, users } from "@/lib/db/schema";
import { ilike, isNotNull } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";
import { getCachedData, setCachedData, buildSummaryCacheKey } from "@/lib/sales-cache";
import { fillPendingSnapshots } from "@/lib/impact-snapshots";
import { PORTAL_DEMO } from "@/lib/portal-demo";
import { resolveClientTeam, latestDateForAccounts, type ClientTeamMember } from "@/lib/sales-summary-header";
import { driveLogoSrc, getClientLogoCodes } from "@/lib/client-logos/logo-index";
import {
  applyDemoClientAlias,
  DEMO_DATA_SOURCE,
  isDemoAliasedClient,
} from "@/lib/demo-client-alias";
import {
  type TimePeriod,
  formatLocalDate,
  getISOWeekNumber,
  getMondayOfISOWeek,
  getDateRange,
  getPreviousRange,
} from "@/lib/date-ranges";

export const maxDuration = 60;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;
const SNS_TABLE = `"amazon_source_data"."replenishment_offer_metrics"`;

function goalSuffix(period: TimePeriod): string {
  switch (period) {
    case "1D": return "1D";
    case "7D": return "1W";
    case "1M": return "1M";
    case "3M": return "3M";
    case "6M": return "6M";
    case "1Y": return "1Y";
  }
}

interface RedshiftRow {
  account_id: number;
  account_name: string;
  ad_impressions: number;
  ad_clicks: number;
  ad_spend: number;
  ad_revenue: number;
  ad_orders: number;
  product_sales: number;
  product_quantity: number;
  shipped_units: number;
  shipped_revenue: number;
  ordered_units: number;
  ordered_revenue: number;
  total_order_items: number;
  mobile_app_sessions: number;
  browser_session: number;
  glance_view_byasin: number;
  // Not available in Redshift yet — default to 0
  ntb_orders: number;
  ntb_revenue: number;
  ntb_ordered_units: number;
  inv_age_0_to_90_days: number;
  inv_age_91_to_180_days: number;
  inv_age_181_to_270_days: number;
  inv_age_271_to_365_days: number;
  inv_age_365_plus_days: number;
  former_active_sns_subscriptions: number;
  new_active_sns_subscriptions: number;
  new_sns_subscriptions_revenue: number;
}

function buildAggQuery(startDate: string, endDate: string, periodLabel: string): string {
  return `
    SELECT
      account_id,
      account_name,
      COALESCE(SUM(ad_impressions), 0) AS ad_impressions,
      COALESCE(SUM(ad_clicks), 0) AS ad_clicks,
      COALESCE(SUM(ad_spend), 0) AS ad_spend,
      COALESCE(SUM(ad_revenue), 0) AS ad_revenue,
      COALESCE(SUM(ad_orders), 0) AS ad_orders,
      COALESCE(SUM(product_sales), 0) AS product_sales,
      COALESCE(SUM(product_quantity), 0) AS product_quantity,
      COALESCE(SUM(shipped_units), 0) AS shipped_units,
      COALESCE(SUM(shipped_revenue), 0) AS shipped_revenue,
      COALESCE(SUM(ordered_units), 0) AS ordered_units,
      COALESCE(SUM(ordered_revenue), 0) AS ordered_revenue,
      COALESCE(SUM(total_order_items), 0) AS total_order_items,
      COALESCE(SUM(mobile_app_sessions), 0) AS mobile_app_sessions,
      COALESCE(SUM(browser_session), 0) AS browser_session,
      COALESCE(SUM(glance_view_byasin), 0) AS glance_view_byasin,
      0 AS ntb_orders,
      0 AS ntb_revenue,
      0 AS ntb_ordered_units,
      0 AS inv_age_0_to_90_days,
      0 AS inv_age_91_to_180_days,
      0 AS inv_age_181_to_270_days,
      0 AS inv_age_271_to_365_days,
      0 AS inv_age_365_plus_days,
      0 AS former_active_sns_subscriptions,
      0 AS new_active_sns_subscriptions,
      0 AS new_sns_subscriptions_revenue,
      '${periodLabel}' AS period_label
    FROM (
      SELECT
        account_id,
        account_name,
        report_date,
        COALESCE(MAX(ad_impressions), 0) AS ad_impressions,
        COALESCE(MAX(ad_clicks), 0) AS ad_clicks,
        COALESCE(MAX(ad_spend), 0) AS ad_spend,
        COALESCE(MAX(ad_revenue), 0) AS ad_revenue,
        COALESCE(MAX(ad_orders), 0) AS ad_orders,
        COALESCE(MAX(product_sales), 0) AS product_sales,
        COALESCE(MAX(product_quantity), 0) AS product_quantity,
        COALESCE(MAX(shipped_units), 0) AS shipped_units,
        COALESCE(MAX(shipped_revenue), 0) AS shipped_revenue,
        COALESCE(MAX(ordered_units), 0) AS ordered_units,
        COALESCE(MAX(ordered_revenue), 0) AS ordered_revenue,
        COALESCE(MAX(total_order_items), 0) AS total_order_items,
        COALESCE(MAX(mobile_app_sessions), 0) AS mobile_app_sessions,
        COALESCE(MAX(browser_session), 0) AS browser_session,
        COALESCE(MAX(glance_view_byasin), 0) AS glance_view_byasin
      FROM ${FULL_TABLE}
      WHERE report_date >= '${startDate}'::DATE AND report_date <= '${endDate}'::DATE
      GROUP BY account_id, account_name, report_date
    ) daily
    GROUP BY account_id, account_name
  `;
}

interface ClientInfo {
  clientIdCode: string;
  clientName: string;
  brandName: string | null;
  clientLogoUrl: string | null;
  tier: string | null;
  marketplace: string | null;
  country: string | null;
  ppcManager: string | null;
  accountManager: string | null;
  accountIds: string[];
  onboardingDate: Date | null;
  team: ClientTeamMember[];
  goals: {
    acosGoal: number | null;
    roasGoal: number | null;
    tacosGoal: number | null;
    adSpendBudget: number | null;
    salesForecast: number | null;
    orgRevGoal: number | null;
  };
}

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try { return JSON.parse(rawData); } catch { return {}; }
  }
  if (rawData && typeof rawData === "object") return rawData as Record<string, string>;
  return {};
}

type ClientGoals = ClientInfo["goals"];

function parseGoalValue(raw: Record<string, string>, key: string): number | null {
  const val = raw[key];
  if (!val || val === "N/A" || val.includes("#")) return null;
  const num = parseFloat(val.replace("%", "").replace(",", ""));
  return isNaN(num) ? null : num;
}

function parseGoals(raw: Record<string, string>, suffix: string): ClientGoals {
  return {
    acosGoal: parseGoalValue(raw, `ACOSGoal${suffix}`),
    roasGoal: parseGoalValue(raw, `ROASGoal${suffix}`),
    tacosGoal: parseGoalValue(raw, `TACOSGoal${suffix}`),
    adSpendBudget: parseGoalValue(raw, `ADSpendBudget${suffix}`),
    salesForecast: parseGoalValue(raw, `SalesForecast${suffix}`),
    orgRevGoal: parseGoalValue(raw, `PercentageOrgRevGoal${suffix}`),
  };
}

// Goals live in aac.rawData and are cheap to read. They are intentionally NOT
// trusted from the 24h summary cache: a goal edited via the client form would
// otherwise not surface in the summary until the cache expired. Always overlay
// fresh goals on top of cached (and freshly-computed) Redshift metrics.
async function loadGoalsByClient(suffix: string): Promise<{
  goalsByClient: Map<string, ClientGoals>;
  logosByClient: Map<string, string | null>;
  teamByClient: Map<string, ClientTeamMember[]>;
}> {
  const rows = await db
    .select({
      clientIdCode: aac.clientIdCode,
      rawData: aac.rawData,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));
  // Logos come only from Drive (1o8 Hub_Backend/Client Logos).
  const logoCodes = await getClientLogoCodes();
  const goalsByClient = new Map<string, ClientGoals>();
  const logosByClient = new Map<string, string | null>();
  const teamByClient = new Map<string, ClientTeamMember[]>();
  const teamUsers = await loadTeamUsers();
  for (const r of rows) {
    if (!r.clientIdCode) continue;
    const raw = parseRawData(r.rawData);
    goalsByClient.set(r.clientIdCode, parseGoals(raw, suffix));
    logosByClient.set(r.clientIdCode, driveLogoSrc(r.clientIdCode, logoCodes));
    teamByClient.set(r.clientIdCode, resolveClientTeam(raw, teamUsers));
  }
  return { goalsByClient, logosByClient, teamByClient };
}

// Team members are stored by NAME in aac.rawData; the users table supplies the
// Google avatar. Like goals, the team is overlaid live, never read from cache.
function loadTeamUsers() {
  return db
    .select({ name: users.name, email: users.email, image: users.image })
    .from(users)
    .where(isNotNull(users.name));
}

function computeMetrics(m: RedshiftRow) {
  const acos = m.ad_revenue > 0 ? (m.ad_spend / m.ad_revenue) * 100 : null;
  const roas = m.ad_spend > 0 ? m.ad_revenue / m.ad_spend : null;
  const tacos = m.product_sales > 0 ? (m.ad_spend / m.product_sales) * 100 : null;
  const ctr = m.ad_impressions > 0 ? (m.ad_clicks / m.ad_impressions) * 100 : null;
  const totalSessions = m.mobile_app_sessions + m.browser_session;
  const pctOrgRevenue = m.product_sales > 0
    ? Math.max(0, Math.min(100, ((m.product_sales - m.ad_revenue) / m.product_sales) * 100)) : null;
  const pctPpcRevenue = m.product_sales > 0
    ? Math.max(0, Math.min(100, (m.ad_revenue / m.product_sales) * 100)) : null;
  const unitSessionPct = totalSessions > 0
    ? (m.product_quantity / totalSessions) * 100 : null;

  return {
    acos, roas, tacos, ctr, totalSessions,
    pctOrgRevenue, pctPpcRevenue, unitSessionPct,
  };
}

export async function GET(req: NextRequest) {
  try {
  // Allow cron refresh via CRON_SECRET bearer token
  const isCronRequest = req.headers.get("x-cron-refresh") === "true";
  const cronSecret = process.env.CRON_SECRET;
  let session: Awaited<ReturnType<typeof getAuthSession>> = null;

  if (isCronRequest && cronSecret && req.headers.get("authorization") === `Bearer ${cronSecret}`) {
    // Cron-authenticated — proceed without session
  } else {
    session = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (session?.user?.clientStatus === "Prospect") return NextResponse.json(PORTAL_DEMO.salesSummary);

  const period = (req.nextUrl.searchParams.get("period") || "1M") as TimePeriod;
  const customStart = req.nextUrl.searchParams.get("start");
  const customEnd = req.nextUrl.searchParams.get("end");

  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  const isCustomRange = customStart && customEnd;
  const { start, end } = isCustomRange
    ? { start: customStart, end: customEnd }
    : getDateRange(period);
  const suffix = goalSuffix(period);

  // Check cache first (unless refresh requested)
  const cacheKey = buildSummaryCacheKey(start, end);
  if (!refresh) {
    try {
      const cached = await getCachedData<Record<string, unknown>>("summary", cacheKey);
      if (cached) {
        // Overlay live goals — never serve the goals frozen in the cache blob,
        // so edits made via the client form appear immediately.
        const { goalsByClient, logosByClient, teamByClient } = await loadGoalsByClient(suffix);
        const includeTeam = session?.user.role !== "client";
        const clientParam = req.nextUrl.searchParams.get("client");
        let clients = (cached.clients as Array<{ clientIdCode: string; goals?: ClientGoals; clientName?: string | null; brandName?: string | null; clientLogoUrl?: string | null }>).map((c) => {
          const fresh = goalsByClient.get(c.clientIdCode);
          const logo = logosByClient.get(c.clientIdCode);
          return {
            ...c,
            ...(fresh ? { goals: fresh } : {}),
            clientLogoUrl: logo ?? null,
            team: includeTeam ? teamByClient.get(c.clientIdCode) ?? [] : [],
          };
        });
        if (clientParam && isDemoAliasedClient(clientParam)) {
          // Keep donor in the pool, then rebrand as the demo client (e.g. Zingora ← DRC).
          clients = applyDemoClientAlias(clients, clientParam);
        } else if (clientParam) {
          clients = clients.filter((r) => r.clientIdCode === clientParam);
        } else if (session?.user.role === "client" && session?.user.clientIdCode) {
          const allowedCodes = (session.user.clientIdCode as string).split(",").map((s: string) => s.trim()).filter(Boolean);
          const withDonors = new Set(allowedCodes.flatMap((code) => {
            const donor = DEMO_DATA_SOURCE[code];
            return donor ? [code, donor] : [code];
          }));
          clients = applyDemoClientAlias(
            clients.filter((r) => withDonors.has(r.clientIdCode)),
          ).filter((r) => allowedCodes.includes(r.clientIdCode));
        } else {
          clients = applyDemoClientAlias(clients);
        }
        return NextResponse.json({ ...cached, clients, fromCache: true });
      }
    } catch (cacheErr) {
      console.warn("[sales-summary] Cache read failed, falling through to Redshift:", cacheErr instanceof Error ? cacheErr.message : cacheErr);
    }
  }

  const { prevStart, prevEnd } = getPreviousRange(start, end);

  // YoY: same ISO week number in the previous year, Sunday-start
  const startDate = new Date(start + "T00:00:00");
  const mondayOfStart = new Date(startDate);
  mondayOfStart.setDate(startDate.getDate() + 1);
  const isoWeek = getISOWeekNumber(mondayOfStart);
  const prevYear = mondayOfStart.getFullYear() - 1;
  const yoyMonday = getMondayOfISOWeek(prevYear, isoWeek);
  const yoySunday = new Date(yoyMonday);
  yoySunday.setDate(yoyMonday.getDate() - 1);
  const diffDays = Math.round((new Date(end + "T00:00:00").getTime() - startDate.getTime()) / 86400000);
  const yoyEndDate = new Date(yoySunday);
  yoyEndDate.setDate(yoySunday.getDate() + diffDays);
  const yoyStartStr = formatLocalDate(yoySunday);
  const yoyEndStr = formatLocalDate(yoyEndDate);

  // MTD
  const endDate = new Date(end + "T00:00:00");
  const mtdStartStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-01`;
  const mtdEndStr = end;

  // YTD
  const ytdStartStr = `${endDate.getFullYear()}-01-01`;
  const ytdEndStr = end;

  // 1. Get active clients with Intentwise mapping from AAC
  const activeClients = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      rawData: aac.rawData,
      onboardingDate: aac.onboardingDate,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));

  const iwToClient = new Map<string, ClientInfo>();
  // Clients without an IntentwiseID still appear — keyed by clientIdCode
  const noIwClients: ClientInfo[] = [];

  const includeTeam = session?.user.role !== "client";
  const [teamUsers, logoCodes] = await Promise.all([
    includeTeam ? loadTeamUsers() : Promise.resolve([]),
    getClientLogoCodes(),
  ]);
  for (const c of activeClients) {
    const raw = parseRawData(c.rawData);
    const iwId = raw.IntentwiseID;

    const info: ClientInfo = {
      clientIdCode: c.clientIdCode!,
      clientName: c.clientName || c.clientIdCode!,
      brandName: raw.BrandName || null,
      clientLogoUrl: driveLogoSrc(c.clientIdCode, logoCodes),
      tier: raw.Tier || null,
      marketplace: raw.Marketplace || null,
      country: raw.Country || null,
      ppcManager: raw.PPCManager_MF || null,
      accountManager: raw.AccountManager_MF || null,
      accountIds: iwId ? [iwId] : [],
      onboardingDate: c.onboardingDate ?? null,
      team: includeTeam ? resolveClientTeam(raw, teamUsers) : [],
      goals: parseGoals(raw, suffix),
    };

    if (iwId) {
      iwToClient.set(iwId, info);
    } else {
      noIwClients.push(info);
    }
  }

  // 2. Query all periods in a single Redshift call using UNION ALL
  const combinedSql = `
    ${buildAggQuery(start, end, "current")}
    UNION ALL
    ${buildAggQuery(prevStart, prevEnd, "previous")}
    UNION ALL
    ${buildAggQuery(yoyStartStr, yoyEndStr, "yoy")}
    UNION ALL
    ${buildAggQuery(mtdStartStr, mtdEndStr, "mtd")}
    UNION ALL
    ${buildAggQuery(ytdStartStr, ytdEndStr, "ytd")}
  `;

  // Latest date with sales data, per account. The page-wide latestDataDate is
  // the max of these; per-client dates expose a single stalled feed (TRT/TRS
  // stopped at 2026-09-19 while the page-wide date read 09-28).
  const latestDateSql = `
    SELECT account_id::TEXT AS account_id, MAX(report_date)::TEXT AS latest_date
    FROM ${FULL_TABLE}
    WHERE product_sales IS NOT NULL
    GROUP BY account_id
  `;

  // Query last table refresh time from Redshift system catalog
  const lastRefreshSql = `
    SELECT COALESCE(
      (SELECT MAX(endtime)::TEXT AS last_refresh
       FROM stl_insert si
       JOIN stv_tbl_perm tp ON si.tbl = tp.id
       WHERE tp.name = '${RS_TABLE}'
       AND tp.slice = 0),
      NULL
    ) AS last_refresh
  `;

  // Query active SNS subscriptions from replenishment_offer_metrics
  // This is a cumulative metric — take the latest snapshot (max end_date) per account per period
  // SNS data is weekly and often lags — get the most recent snapshot up to the period's end date
  function buildSnsSql(endDate: string, periodLabel: string): string {
    return `
      SELECT
        r.account_id::BIGINT AS account_id,
        COALESCE(SUM(r.active_subscriptions::FLOAT), 0)::BIGINT AS active_subscriptions,
        '${periodLabel}' AS period_label
      FROM ${SNS_TABLE} r
      INNER JOIN (
        SELECT account_id, MAX(end_date) AS max_date
        FROM ${SNS_TABLE}
        WHERE end_date::DATE <= '${endDate}'::DATE
        GROUP BY account_id
      ) latest ON r.account_id = latest.account_id AND r.end_date = latest.max_date
      GROUP BY r.account_id
    `;
  }

  const snsSql = `
    ${buildSnsSql(end, "current")}
    UNION ALL
    ${buildSnsSql(prevEnd, "previous")}
    UNION ALL
    ${buildSnsSql(yoyEndStr, "yoy")}
    UNION ALL
    ${buildSnsSql(mtdEndStr, "mtd")}
    UNION ALL
    ${buildSnsSql(ytdEndStr, "ytd")}
  `;

  const [allRows, latestDateResult, refreshResult, snsRows] = await Promise.all([
    queryRedshift<RedshiftRow & { period_label: string }>(combinedSql),
    queryRedshift<{ account_id: string; latest_date: string }>(latestDateSql),
    queryRedshift<{ last_refresh: string | null }>(`${lastRefreshSql}`).catch(() => [{ last_refresh: null }]),
    queryRedshift<{ account_id: number; active_subscriptions: number; period_label: string }>(snsSql).catch(() => []),
  ]);

  const latestSalesByAccount = new Map<string, string>();
  for (const r of latestDateResult) {
    if (r.latest_date) latestSalesByAccount.set(String(r.account_id), r.latest_date);
  }
  const latestDataDate = latestDateForAccounts([...latestSalesByAccount.keys()], latestSalesByAccount);
  const lastRefreshedAt = refreshResult[0]?.last_refresh || null;

  // Build SNS lookup: Map<"period_label|account_id", active_subscriptions>
  const snsMap = new Map<string, number>();
  for (const row of snsRows) {
    const key = `${row.period_label}|${row.account_id}`;
    snsMap.set(key, Number(row.active_subscriptions) || 0);
  }

  // Inject SNS data into main rows
  for (const row of allRows) {
    const key = `${row.period_label}|${row.account_id}`;
    const sns = snsMap.get(key);
    if (sns != null) {
      (row as unknown as Record<string, unknown>).new_active_sns_subscriptions = sns;
    }
  }

  // 3. Split into periods
  const currentRows = allRows.filter((r) => r.period_label === "current");
  const prevRows = allRows.filter((r) => r.period_label === "previous");
  const yoyRows = allRows.filter((r) => r.period_label === "yoy");
  const mtdRows = allRows.filter((r) => r.period_label === "mtd");
  const ytdRows = allRows.filter((r) => r.period_label === "ytd");

  function toNumber(val: unknown): number {
    if (typeof val === "number") return val;
    if (typeof val === "string") return parseFloat(val) || 0;
    return 0;
  }

  function normalizeRow(row: Record<string, unknown>): RedshiftRow {
    return {
      account_id: toNumber(row.account_id),
      account_name: String(row.account_name || ""),
      ad_impressions: toNumber(row.ad_impressions),
      ad_clicks: toNumber(row.ad_clicks),
      ad_spend: toNumber(row.ad_spend),
      ad_revenue: toNumber(row.ad_revenue),
      ad_orders: toNumber(row.ad_orders),
      product_sales: toNumber(row.product_sales),
      product_quantity: toNumber(row.product_quantity),
      shipped_units: toNumber(row.shipped_units),
      shipped_revenue: toNumber(row.shipped_revenue),
      ordered_units: toNumber(row.ordered_units),
      ordered_revenue: toNumber(row.ordered_revenue),
      total_order_items: toNumber(row.total_order_items),
      mobile_app_sessions: toNumber(row.mobile_app_sessions),
      browser_session: toNumber(row.browser_session),
      glance_view_byasin: toNumber(row.glance_view_byasin),
      ntb_orders: toNumber(row.ntb_orders),
      ntb_revenue: toNumber(row.ntb_revenue),
      ntb_ordered_units: toNumber(row.ntb_ordered_units),
      inv_age_0_to_90_days: toNumber(row.inv_age_0_to_90_days),
      inv_age_91_to_180_days: toNumber(row.inv_age_91_to_180_days),
      inv_age_181_to_270_days: toNumber(row.inv_age_181_to_270_days),
      inv_age_271_to_365_days: toNumber(row.inv_age_271_to_365_days),
      inv_age_365_plus_days: toNumber(row.inv_age_365_plus_days),
      former_active_sns_subscriptions: toNumber(row.former_active_sns_subscriptions),
      new_active_sns_subscriptions: toNumber(row.new_active_sns_subscriptions),
      new_sns_subscriptions_revenue: toNumber(row.new_sns_subscriptions_revenue),
    };
  }

  function mergeRows(rows: (RedshiftRow & { period_label: string })[]): Map<string, RedshiftRow> {
    const map = new Map<string, RedshiftRow>();
    for (const rawRow of rows) {
      const row = normalizeRow(rawRow as unknown as Record<string, unknown>);
      const client = iwToClient.get(String(row.account_id));
      if (!client) continue;
      const existing = map.get(client.clientIdCode);
      if (existing) {
        const keys: (keyof RedshiftRow)[] = [
          "ad_impressions","ad_clicks","ad_spend","ad_revenue","ad_orders",
          "product_sales","product_quantity","shipped_units","shipped_revenue",
          "ordered_units","ordered_revenue","total_order_items",
          "mobile_app_sessions","browser_session","glance_view_byasin",
          "ntb_orders","ntb_revenue","ntb_ordered_units",
          "new_active_sns_subscriptions","new_sns_subscriptions_revenue",
        ];
        for (const k of keys) {
          (existing[k] as number) += row[k] as number;
        }
      } else {
        map.set(client.clientIdCode, row);
      }
    }
    return map;
  }

  const currentMap = mergeRows(currentRows);
  const prevMap = mergeRows(prevRows);
  const yoyMap = mergeRows(yoyRows);
  const mtdMap = mergeRows(mtdRows);
  const ytdMap = mergeRows(ytdRows);

  const emptyRow = (): RedshiftRow => ({
    account_id: 0, account_name: "",
    ad_impressions: 0, ad_clicks: 0, ad_spend: 0, ad_revenue: 0, ad_orders: 0,
    product_sales: 0, product_quantity: 0, shipped_units: 0, shipped_revenue: 0,
    ordered_units: 0, ordered_revenue: 0, total_order_items: 0,
    mobile_app_sessions: 0, browser_session: 0, glance_view_byasin: 0,
    ntb_orders: 0, ntb_revenue: 0, ntb_ordered_units: 0,
    inv_age_0_to_90_days: 0, inv_age_91_to_180_days: 0, inv_age_181_to_270_days: 0,
    inv_age_271_to_365_days: 0, inv_age_365_plus_days: 0,
    former_active_sns_subscriptions: 0, new_active_sns_subscriptions: 0, new_sns_subscriptions_revenue: 0,
  });

  // 4. Build results — all active clients, zero-fill those with no Redshift data
  const results: Array<{
    clientIdCode: string;
    clientName: string;
    brandName: string | null;
    clientLogoUrl: string | null;
    tier: string | null;
    marketplace: string | null;
    ppcManager: string | null;
    accountManager: string | null;
    accountIds: string[];
    onboardingDate: string | null;
    latestSalesDate: string | null;
    team: ClientTeamMember[];
    goals: ClientInfo["goals"];
    current: RedshiftRow;
    previous: RedshiftRow | null;
    yoy: RedshiftRow | null;
    mtd: RedshiftRow | null;
    ytd: RedshiftRow | null;
    computed: ReturnType<typeof computeMetrics>;
    prevComputed: ReturnType<typeof computeMetrics> | null;
    yoyComputed: ReturnType<typeof computeMetrics> | null;
    mtdComputed: ReturnType<typeof computeMetrics> | null;
    ytdComputed: ReturnType<typeof computeMetrics> | null;
  }> = [];

  // Collect all active client infos (IW-mapped + non-IW)
  const allClientInfos: ClientInfo[] = [...iwToClient.values(), ...noIwClients];
  const seenClientIds = new Set<string>();

  for (const info of allClientInfos) {
    if (seenClientIds.has(info.clientIdCode)) continue;
    seenClientIds.add(info.clientIdCode);

    const clientId = info.clientIdCode;
    const metrics = currentMap.get(clientId) ?? emptyRow();
    const prev = prevMap.get(clientId) ?? null;
    const yoy = yoyMap.get(clientId) ?? null;
    const mtd = mtdMap.get(clientId) ?? null;
    const ytd = ytdMap.get(clientId) ?? null;
    results.push({
      clientIdCode: info.clientIdCode,
      clientName: info.clientName,
      brandName: info.brandName,
      clientLogoUrl: info.clientLogoUrl,
      tier: info.tier,
      marketplace: info.marketplace,
      ppcManager: info.ppcManager,
      accountManager: info.accountManager,
      accountIds: info.accountIds,
      onboardingDate: info.onboardingDate ? info.onboardingDate.toISOString() : null,
      latestSalesDate: latestDateForAccounts(info.accountIds, latestSalesByAccount),
      team: info.team,
      goals: info.goals,
      current: metrics,
      previous: prev,
      yoy,
      mtd,
      ytd,
      computed: computeMetrics(metrics),
      prevComputed: prev ? computeMetrics(prev) : null,
      yoyComputed: yoy ? computeMetrics(yoy) : null,
      mtdComputed: mtd ? computeMetrics(mtd) : null,
      ytdComputed: ytd ? computeMetrics(ytd) : null,
    });
  }

  // Sort by onboarding date ascending (nulls last)
  results.sort((a, b) => {
    const tA = a.onboardingDate ? new Date(a.onboardingDate).getTime() : Infinity;
    const tB = b.onboardingDate ? new Date(b.onboardingDate).getTime() : Infinity;
    return tA - tB;
  });

  // Build full response (unfiltered — for caching)
  const fullResponse = {
    period, start, end, prevStart, prevEnd,
    yoyStart: yoyStartStr, yoyEnd: yoyEndStr,
    mtdStart: mtdStartStr, mtdEnd: mtdEndStr,
    ytdStart: ytdStartStr, ytdEnd: ytdEndStr,
    latestDataDate,
    lastRefreshedAt,
    clients: results,
  };

  // Write to cache. Deferred via after() rather than fired-and-forgotten: an
  // un-awaited DB write is abandoned mid-protocol when Vercel freezes the sandbox,
  // leaving an open transaction that pins a Supavisor pool slot. See
  // src/lib/sales-cache.awaited.test.ts for the full failure mode.
  after(async () => {
    try {
      await setCachedData("summary", cacheKey, fullResponse);
    } catch (err) {
      console.error("Failed to write summary cache:", err);
    }
  });

  // Revenue attribution: fill pending impact snapshots per client. Same reasoning
  // as above — these are DB writes and must outlive the response, not race it.
  after(async () => {
    for (const client of results) {
      const m = client.current;
      try {
        await fillPendingSnapshots(client.clientIdCode, {
          product_sales: m.product_sales,
          ad_spend: m.ad_spend,
          ad_revenue: m.ad_revenue,
          ordered_units: m.ordered_units,
          ordered_revenue: m.ordered_revenue,
          glance_view_byasin: m.glance_view_byasin,
          ad_impressions: m.ad_impressions,
          ad_clicks: m.ad_clicks,
        });
      } catch (err) {
        console.error(
          "Failed to fill impact snapshots for",
          client.clientIdCode,
          err,
        );
      }
    }
  });

  // Filter to specific client if requested or client-role user.
  // Demo aliases (ZIN ← DRC) borrow the donor's metrics under Zingora branding.
  const clientParam = req.nextUrl.searchParams.get("client");
  let filteredResults = results;
  if (clientParam && isDemoAliasedClient(clientParam)) {
    filteredResults = applyDemoClientAlias(results, clientParam);
  } else if (clientParam) {
    filteredResults = results.filter((r) => r.clientIdCode === clientParam);
  } else if (session?.user.role === "client" && session?.user.clientIdCode) {
    const allowedCodes = session.user.clientIdCode.split(",").map((s: string) => s.trim()).filter(Boolean);
    const withDonors = new Set(allowedCodes.flatMap((code) => {
      const donor = DEMO_DATA_SOURCE[code];
      return donor ? [code, donor] : [code];
    }));
    filteredResults = applyDemoClientAlias(
      results.filter((r) => withDonors.has(r.clientIdCode)),
    ).filter((r) => allowedCodes.includes(r.clientIdCode));
  } else {
    filteredResults = applyDemoClientAlias(results);
  }

  return NextResponse.json({
    ...fullResponse,
    clients: filteredResults,
    fromCache: false,
  });
  } catch (err) {
    console.error("[sales-summary] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
