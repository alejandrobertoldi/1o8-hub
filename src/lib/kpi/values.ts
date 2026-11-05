/**
 * Main KPI values from kpi_daily totals. Pure; unit-tested.
 *
 * Each KPI says how it's computed and from which sources. Until a source is
 * connected some KPIs fall back to GA4 (e.g. Orders from GA4 purchases) and
 * say so in `basis`, so nobody mistakes GA4 revenue for Shopify net sales.
 */

/** Summed metric totals for a period, keyed "source:metric" (e.g. "ga4:sessions"). */
export type Totals = Record<string, number>;

export type KpiUnit = "money" | "count" | "percent" | "ratio";
export type KpiValue = { value: number; unit: KpiUnit; basis: string };

const get = (t: Totals, k: string) => (k in t ? t[k] : undefined);
const div = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined || b === 0 ? undefined : a / b);

/**
 * Google Ads figures: from the Google Ads API when the client's account is
 * connected (the platform's own numbers), else as GA4 sees them through its
 * Google Ads link (revenue = GA4 google / cpc sessions).
 */
export function googleAdsTotals(t: Totals) {
  if (get(t, "google_ads:cost") !== undefined) {
    return {
      cost: get(t, "google_ads:cost"),
      value: get(t, "google_ads:conversion_value"),
      purchases: get(t, "google_ads:conversions"),
      clicks: get(t, "google_ads:clicks"),
      impressions: get(t, "google_ads:impressions"),
      direct: true,
    };
  }
  return {
    cost: get(t, "ga4:google_ads_cost"),
    value: get(t, "ga4:google_ads_revenue"),
    purchases: get(t, "ga4:google_ads_purchases"),
    clicks: get(t, "ga4:google_ads_clicks"),
    impressions: get(t, "ga4:google_ads_impressions"),
    direct: false,
  };
}

/** The value of a catalog KPI over a period, or null when its sources aren't connected yet. */
export function kpiValue(key: string, t: Totals): KpiValue | null {
  // Paid media across platforms: Meta + Google Ads (from GA4 when linked).
  const metaSpend = get(t, "meta:spend");
  const ads = googleAdsTotals(t);
  const googleSpend = ads.cost;
  const spend = metaSpend === undefined && googleSpend === undefined ? undefined : (metaSpend ?? 0) + (googleSpend ?? 0);
  const metaValue = get(t, "meta:purchase_value");
  const googleValue = ads.value;
  const platformValue = metaValue === undefined && googleValue === undefined ? undefined : (metaValue ?? 0) + (googleValue ?? 0);
  const shopifyOrders = get(t, "shopify:orders");
  const shopifyNet = get(t, "shopify:net_sales");
  const sessions = get(t, "ga4:sessions");
  const v = (value: number | undefined, unit: KpiUnit, basis: string): KpiValue | null =>
    value === undefined || !Number.isFinite(value) ? null : { value, unit, basis };

  switch (key) {
    case "net_sales":
      return v(shopifyNet, "money", "Shopify") ?? v(get(t, "ga4:purchase_revenue"), "money", "GA4 revenue (until Shopify is connected)");
    case "gross_sales":
      return v(get(t, "shopify:gross_sales"), "money", "Shopify");
    case "orders":
      return v(shopifyOrders, "count", "Shopify") ?? v(get(t, "ga4:purchases"), "count", "GA4 purchases (until Shopify is connected)");
    case "aov":
      return v(div(shopifyNet, shopifyOrders), "money", "Shopify") ?? v(div(get(t, "ga4:purchase_revenue"), get(t, "ga4:purchases")), "money", "GA4 (until Shopify is connected)");
    case "conversion_rate":
      return v(div(shopifyOrders, sessions), "percent", "Shopify orders ÷ GA4 sessions") ?? v(div(get(t, "ga4:purchases"), sessions), "percent", "GA4 purchases ÷ sessions");
    case "new_customers":
      return v(get(t, "shopify:new_customers"), "count", "Shopify (first-time customers' orders)");
    case "new_customer_sales":
      return v(get(t, "shopify:new_customer_sales"), "money", "Shopify (first-time customers)");
    case "returning_customer_rate": {
      const nc = get(t, "shopify:new_customers");
      return v(shopifyOrders && nc !== undefined ? (shopifyOrders - nc) / shopifyOrders : undefined, "percent", "Shopify (returning customers' share of orders)");
    }
    case "returns":
      return v(get(t, "shopify:returns"), "money", "Shopify");
    case "blended_roas":
      return v(div(shopifyNet, spend), "ratio", "Shopify net sales ÷ ad spend (Meta + Google)");
    case "prospecting_roas":
      return null;
    case "cac":
      return v(div(spend, get(t, "shopify:new_customers")), "money", "Ad spend (Meta + Google) ÷ Shopify new customers");
    case "website_roas":
      return v(div(platformValue, spend), "ratio", "Platform-reported revenue ÷ spend (Meta + Google)");
    case "ad_spend":
      return v(spend, "money", "Meta + Google Ads");
    case "sessions":
      return v(sessions, "count", "GA4");
    case "website_leads":
    case "bookings":
    case "memberships_sold":
    case "course_registrations":
      return v(get(t, "ga4:key_events"), "count", "GA4 key events");
    case "email_revenue":
      return v(get(t, "klaviyo:attributed_revenue"), "money", "Klaviyo (email + SMS attributed)");
    case "email_list_growth":
      return v(get(t, "klaviyo:net_subscribers"), "count", "Klaviyo");
    case "email_flow_vs_campaign": {
      const flows = get(t, "klaviyo:flow_revenue");
      const total = get(t, "klaviyo:attributed_revenue");
      if (flows === undefined || total === undefined) return null;
      const campaigns = Math.max(total - flows, 0);
      return v(div(flows, total), "percent", `Flows ${money(flows)} · Campaigns ${money(campaigns)} (Klaviyo)`);
    }
    case "email_engagement": {
      const delivered = get(t, "klaviyo:emails_delivered");
      const clickRate = div(get(t, "klaviyo:emails_clicked"), delivered);
      const basis = clickRate === undefined ? "Klaviyo open rate" : `Open rate · click rate ${(clickRate * 100).toFixed(2)}% (Klaviyo)`;
      return v(div(get(t, "klaviyo:emails_opened"), delivered), "percent", basis);
    }
    case "email_deliverability": {
      const delivered = get(t, "klaviyo:emails_delivered");
      const bounced = get(t, "klaviyo:emails_bounced");
      return v(div(delivered, delivered === undefined ? undefined : delivered + (bounced ?? 0)), "percent", "Klaviyo delivered ÷ (delivered + bounced)");
    }
    default:
      return null;
  }
}

const money = (n: number) => formatKpi({ value: n, unit: "money", basis: "" });

/** Rates and ratios compare as-is; everything else is a total that grows over the month. */
export const isRate = (unit: KpiUnit) => unit === "percent" || unit === "ratio";

/** "Lower is better" KPIs. */
const LOWER_IS_BETTER = new Set(["cac"]);

/**
 * The first number in a free-text target: "$150k / mo" → 150000, "4.0x" → 4,
 * "2.5%" → 0.025 (as a fraction, like conversion rates). Null when none.
 */
export function parseTarget(text: string | undefined, unit: KpiUnit): number | null {
  const m = /(-?\d[\d,]*\.?\d*)\s*([kKmM%])?/.exec(text ?? "");
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const suffix = m[2]?.toLowerCase();
  if (suffix === "k") n *= 1_000;
  if (suffix === "m") n *= 1_000_000;
  if (unit === "percent" && (suffix === "%" || n > 1)) n /= 100;
  return n;
}

export type TargetStatus = "on_track" | "behind" | null;

/**
 * Month-to-date against a monthly target: totals are projected to the full
 * month (MTD ÷ days elapsed × days in month); rates compare directly.
 */
export function targetStatus(key: string, value: KpiValue, target: number | null, daysElapsed: number, daysInMonth: number): TargetStatus {
  if (target === null || daysElapsed <= 0) return null;
  // Averages (rates, AOV, CAC) compare as-is; totals are projected.
  const average = isRate(value.unit) || key === "cac" || key === "aov";
  const comparable = average ? value.value : (value.value / daysElapsed) * daysInMonth;
  const good = LOWER_IS_BETTER.has(key) ? comparable <= target : comparable >= target;
  return good ? "on_track" : "behind";
}

export function formatKpi(v: KpiValue): string {
  switch (v.unit) {
    case "money": {
      // Discounts and returns come in negative: "-$1,368.50", not "$-1,368.5".
      const sign = v.value < 0 ? "-" : "";
      const abs = Math.abs(v.value);
      if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
      return abs >= 10_000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    }
    case "percent":
      return `${(v.value * 100).toFixed(2)}%`;
    case "ratio":
      return `${v.value.toFixed(2)}x`;
    default:
      return Math.round(v.value).toLocaleString("en-US");
  }
}
