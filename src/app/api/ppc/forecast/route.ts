/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/nextjs-no-side-effect-in-get-handler */
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";
import { aac, clientForecasts } from "@/lib/db/schema";
import { eq, ilike } from "drizzle-orm";
import { queryRedshift } from "@/lib/redshift";

export const maxDuration = 120;

const RS_SCHEMA = "intentwise_ecommerce_graph";
const RS_TABLE = "account_summary";
const FULL_TABLE = `"${RS_SCHEMA}"."${RS_TABLE}"`;

const CHANNEL_LABELS: Record<string, string> = {
  SC: "Amazon SC",
  VC: "Amazon VC",
  WF: "Whole Foods",
};

function parseRawData(rawData: unknown): Record<string, string> {
  if (typeof rawData === "string") {
    try { return JSON.parse(rawData); } catch { return {}; }
  }
  if (rawData && typeof rawData === "object") return rawData as Record<string, string>;
  return {};
}

function parseClientCode(code: string): { brand: string; channel: string; country: string } | null {
  const parts = code.split("_");
  if (parts.length < 3) return null;
  return { brand: parts[0], channel: parts[1], country: parts[parts.length - 1] };
}

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function generateMonths(): string[] {
  const now = new Date();
  const prevYear = now.getFullYear() - 1;
  const currentYear = now.getFullYear();
  const endMonth = `${currentYear}-12`;
  const months: string[] = [];
  for (let y = prevYear; y <= currentYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (key > endMonth) return months;
      months.push(key);
    }
  }
  return months;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIdCode = req.nextUrl.searchParams.get("clientIdCode");
  if (!clientIdCode) {
    return NextResponse.json({ error: "Missing clientIdCode" }, { status: 400 });
  }

  // Portal clients can only see their own brand group
  if (session.user.role === "client" && session.user.clientIdCode) {
    const allowedCodes = (session.user.clientIdCode as string).split(",").map((s: string) => s.trim());
    const parsed = parseClientCode(clientIdCode);
    const allowed = allowedCodes.some((code) => {
      const p = parseClientCode(code);
      return p && parsed && p.brand === parsed.brand;
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const parsed = parseClientCode(clientIdCode);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid clientIdCode format" }, { status: 400 });
  }

  // Find all active AAC siblings with same brand prefix
  const allActive = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientName: aac.clientName,
      rawData: aac.rawData,
    })
    .from(aac)
    .where(ilike(aac.clientStatus, "active"));

  interface SiblingInfo {
    clientIdCode: string;
    channel: string;
    accountId: string | null;
    marketplace: string | null;
    country: string | null;
    clientName: string | null;
  }

  const siblings: SiblingInfo[] = [];
  let primaryName = "";
  let primaryMarketplace = "";
  let primaryCountry = "";
  let goals: { acosGoal: number | null; roasGoal: number | null; adSpendBudget: number | null; salesForecast: number | null } = {
    acosGoal: null, roasGoal: null, adSpendBudget: null, salesForecast: null,
  };

  const parseGoal = (raw: Record<string, string>, key: string): number | null => {
    const val = raw[key];
    if (!val || val === "N/A" || val.includes("#")) return null;
    const num = parseFloat(val.replace("%", "").replace(",", ""));
    return isNaN(num) ? null : num;
  };

  for (const row of allActive) {
    const p = parseClientCode(row.clientIdCode!);
    if (!p || p.brand !== parsed.brand) continue;

    const raw = parseRawData(row.rawData);
    siblings.push({
      clientIdCode: row.clientIdCode!,
      channel: p.channel,
      accountId: raw.IntentwiseID || null,
      marketplace: raw.Marketplace || null,
      country: raw.Country || null,
      clientName: row.clientName || null,
    });

    if (row.clientIdCode === clientIdCode) {
      primaryName = row.clientName || raw.BrandName || row.clientIdCode!;
      primaryMarketplace = raw.Marketplace || CHANNEL_LABELS[p.channel] || p.channel;
      primaryCountry = raw.Country || p.country;
      goals = {
        acosGoal: parseGoal(raw, "ACOSGoal1M"),
        roasGoal: parseGoal(raw, "ROASGoal1M"),
        adSpendBudget: parseGoal(raw, "ADSpendBudget1M"),
        salesForecast: parseGoal(raw, "SalesForecast1M"),
      };
    }
  }

  if (!primaryName && siblings.length > 0) {
    const first = siblings[0];
    primaryName = first.clientName || first.clientIdCode;
    primaryMarketplace = first.marketplace || CHANNEL_LABELS[first.channel] || first.channel;
    primaryCountry = first.country || "";
  }

  // Query Redshift for monthly data per sibling account
  const accountIds = siblings
    .filter((s) => s.accountId)
    .map((s) => parseInt(s.accountId!, 10))
    .filter((id) => !isNaN(id));

  const months = generateMonths();
  const prevYear = new Date().getFullYear() - 1;
  const startDate = `${prevYear}-01-01`;

  interface RedshiftMonthlyRow {
    account_id: number;
    month: string;
    product_sales: number;
    ad_spend: number;
    days_included: number;
  }

  let redshiftRows: RedshiftMonthlyRow[] = [];
  let latestDate = "";

  if (accountIds.length > 0) {
    const inClause = accountIds.map((id) => `${id}::BIGINT`).join(",");

    const dataSql = `
      SELECT
        account_id,
        month,
        SUM(product_sales) AS product_sales,
        SUM(ad_spend) AS ad_spend,
        COUNT(DISTINCT report_date) AS days_included
      FROM (
        SELECT
          account_id,
          TO_CHAR(report_date, 'YYYY-MM') AS month,
          report_date,
          COALESCE(MAX(product_sales), 0) AS product_sales,
          COALESCE(MAX(ad_spend), 0) AS ad_spend
        FROM ${FULL_TABLE}
        WHERE account_id IN (${inClause})
          AND report_date >= '${startDate}'::DATE
        GROUP BY account_id, report_date, TO_CHAR(report_date, 'YYYY-MM')
      ) daily
      GROUP BY account_id, month
      ORDER BY account_id, month
    `;

    const latestSql = `
      SELECT MAX(report_date)::TEXT AS latest_date
      FROM ${FULL_TABLE}
      WHERE account_id IN (${inClause})
        AND product_sales IS NOT NULL
    `;

    const [dataRows, latestResult] = await Promise.all([
      queryRedshift<RedshiftMonthlyRow>(dataSql),
      queryRedshift<{ latest_date: string }>(latestSql),
    ]);

    redshiftRows = dataRows;
    latestDate = latestResult[0]?.latest_date || "";
  }

  // Build per-channel data
  const accountToChannel = new Map<number, string>();
  for (const s of siblings) {
    if (s.accountId) {
      accountToChannel.set(parseInt(s.accountId, 10), s.channel);
    }
  }

  const channelSales = new Map<string, Record<string, number>>();
  const channelAdSpend = new Map<string, Record<string, number>>();
  const daysIncludedMap = new Map<string, number>();

  for (const row of redshiftRows) {
    const channel = accountToChannel.get(Number(row.account_id));
    if (!channel) continue;

    if (!channelSales.has(channel)) channelSales.set(channel, {});
    if (!channelAdSpend.has(channel)) channelAdSpend.set(channel, {});

    const sales = Number(row.product_sales) || 0;
    const spend = Number(row.ad_spend) || 0;
    if (sales > 0) channelSales.get(channel)![row.month] = sales;
    if (spend > 0) channelAdSpend.get(channel)![row.month] = spend;

    const days = Number(row.days_included) || 0;
    const existing = daysIncludedMap.get(row.month) || 0;
    if (days > existing) daysIncludedMap.set(row.month, days);
  }

  // Build standard 3 channel slots
  const standardChannels = ["SC", "VC", "WF"];
  const channels = standardChannels.map((key) => {
    const sibling = siblings.find((s) => s.channel === key);
    return {
      key,
      label: CHANNEL_LABELS[key] || key,
      clientIdCode: sibling?.clientIdCode || null,
      accountId: sibling?.accountId || null,
      sales: channelSales.get(key) || {},
      adSpend: channelAdSpend.get(key) || {},
    };
  });

  // Build daysIncluded
  const daysIncluded: Record<string, { included: number; total: number }> = {};
  for (const m of months) {
    const included = daysIncludedMap.get(m) || 0;
    const total = daysInMonth(m);
    if (included > 0) {
      daysIncluded[m] = { included, total };
    }
  }

  // Query forecasts for primary client code
  const forecastRows = await db
    .select({
      month: clientForecasts.month,
      metric: clientForecasts.metric,
      forecastValue: clientForecasts.forecastValue,
    })
    .from(clientForecasts)
    .where(eq(clientForecasts.clientIdCode, clientIdCode));

  const forecasts: { product_sales: Record<string, number>; ad_spend: Record<string, number> } = {
    product_sales: {},
    ad_spend: {},
  };
  for (const row of forecastRows) {
    const val = parseFloat(row.forecastValue || "0");
    if (val > 0 && (row.metric === "product_sales" || row.metric === "ad_spend")) {
      forecasts[row.metric][row.month] = val;
    }
  }

  return NextResponse.json({
    brand: primaryName,
    primaryClientIdCode: clientIdCode,
    marketplace: primaryMarketplace,
    country: primaryCountry,
    latestDate,
    months,
    daysIncluded,
    channels,
    forecasts,
    goals,
  });
}
