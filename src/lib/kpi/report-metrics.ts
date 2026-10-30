import type { KpiUnit, Totals } from "./values";

/**
 * The metrics each report page shows, computed from "source:metric" totals —
 * the same function serves a whole range and a single day. Pure.
 */

export type ReportMetric = {
  key: string;
  label: string;
  unit: KpiUnit;
  compute: (t: Totals) => number | undefined;
  /** Lower is better (cost metrics): deltas color the other way. */
  lowerIsBetter?: boolean;
  hint?: string;
};

const g = (t: Totals, k: string) => (k in t ? t[k] : undefined);
const div = (a: number | undefined, b: number | undefined) => (a === undefined || b === undefined || b === 0 ? undefined : a / b);

const sum = (...xs: (number | undefined)[]) => (xs.every((x) => x === undefined) ? undefined : xs.reduce<number>((a, x) => a + (x ?? 0), 0));
const totalSpend = (t: Totals) => sum(g(t, "meta:spend"), g(t, "ga4:google_ads_cost"));
const totalValue = (t: Totals) => sum(g(t, "meta:purchase_value"), g(t, "ga4:google_ads_revenue"));
const totalPurchases = (t: Totals) => sum(g(t, "meta:purchases"), g(t, "ga4:google_ads_purchases"));

/** All paid platforms together (Meta + Google Ads). */
export const BLENDED: ReportMetric[] = [
  { key: "spend", label: "Total Ad Spend", unit: "money", compute: totalSpend, hint: "Meta + Google Ads" },
  { key: "value", label: "Platform Revenue", unit: "money", compute: totalValue, hint: "What each platform attributes to its ads, added up" },
  { key: "roas", label: "Platform ROAS", unit: "ratio", compute: (t) => div(totalValue(t), totalSpend(t)) },
  { key: "purchases", label: "Purchases", unit: "count", compute: totalPurchases },
  { key: "cpa", label: "Cost per Purchase", unit: "money", compute: (t) => div(totalSpend(t), totalPurchases(t)), lowerIsBetter: true },
  { key: "mer", label: "MER (Blended ROAS)", unit: "ratio", compute: (t) => div(g(t, "shopify:net_sales"), totalSpend(t)), hint: "Shopify net sales ÷ total ad spend" },
];

export const META: ReportMetric[] = [
  { key: "spend", label: "Ad Spend", unit: "money", compute: (t) => g(t, "meta:spend") },
  { key: "purchase_value", label: "Purchase Value", unit: "money", compute: (t) => g(t, "meta:purchase_value"), hint: "Revenue Meta attributes to its ads" },
  { key: "roas", label: "ROAS", unit: "ratio", compute: (t) => div(g(t, "meta:purchase_value"), g(t, "meta:spend")) },
  { key: "purchases", label: "Purchases", unit: "count", compute: (t) => g(t, "meta:purchases") },
  { key: "cpa", label: "Cost per Purchase", unit: "money", compute: (t) => div(g(t, "meta:spend"), g(t, "meta:purchases")), lowerIsBetter: true },
  { key: "cpc", label: "CPC", unit: "money", compute: (t) => div(g(t, "meta:spend"), g(t, "meta:clicks")), lowerIsBetter: true },
  { key: "ctr", label: "CTR", unit: "percent", compute: (t) => div(g(t, "meta:clicks"), g(t, "meta:impressions")) },
];

export const GOOGLE_ADS: ReportMetric[] = [
  { key: "spend", label: "Ad Spend", unit: "money", compute: (t) => g(t, "ga4:google_ads_cost") },
  { key: "revenue", label: "Revenue (google / cpc)", unit: "money", compute: (t) => g(t, "ga4:google_ads_revenue"), hint: "GA4 revenue from google / cpc sessions" },
  { key: "roas", label: "ROAS", unit: "ratio", compute: (t) => div(g(t, "ga4:google_ads_revenue"), g(t, "ga4:google_ads_cost")) },
  { key: "purchases", label: "Purchases", unit: "count", compute: (t) => g(t, "ga4:google_ads_purchases") },
  { key: "cpa", label: "Cost per Purchase", unit: "money", compute: (t) => div(g(t, "ga4:google_ads_cost"), g(t, "ga4:google_ads_purchases")), lowerIsBetter: true },
  { key: "cpc", label: "CPC", unit: "money", compute: (t) => div(g(t, "ga4:google_ads_cost"), g(t, "ga4:google_ads_clicks")), lowerIsBetter: true },
  { key: "ctr", label: "CTR", unit: "percent", compute: (t) => div(g(t, "ga4:google_ads_clicks"), g(t, "ga4:google_ads_impressions")) },
];

export const TRAFFIC: ReportMetric[] = [
  { key: "sessions", label: "Sessions", unit: "count", compute: (t) => g(t, "ga4:sessions") },
  { key: "users", label: "Users", unit: "count", compute: (t) => g(t, "ga4:users") },
  { key: "new_users", label: "New Users", unit: "count", compute: (t) => g(t, "ga4:new_users") },
  { key: "key_events", label: "Key Events", unit: "count", compute: (t) => g(t, "ga4:key_events"), hint: "Leads, bookings and other GA4 key events" },
  {
    key: "conversion_rate",
    label: "Conversion Rate",
    unit: "percent",
    compute: (t) => div(g(t, "shopify:orders") ?? g(t, "ga4:purchases"), g(t, "ga4:sessions")),
    hint: "Orders ÷ sessions (Shopify orders when connected, else GA4 purchases)",
  },
  { key: "ga4_revenue", label: "GA4 Revenue", unit: "money", compute: (t) => g(t, "ga4:purchase_revenue"), hint: "Revenue GA4 tracked; Shopify is the source of truth" },
];

export const EMAIL: ReportMetric[] = [
  { key: "attributed_revenue", label: "Email & SMS Revenue", unit: "money", compute: (t) => g(t, "klaviyo:attributed_revenue") },
  {
    key: "share",
    label: "Share of Store Revenue",
    unit: "percent",
    compute: (t) => div(g(t, "klaviyo:attributed_revenue"), g(t, "shopify:net_sales") ?? g(t, "klaviyo:store_revenue")),
  },
  { key: "attributed_orders", label: "Attributed Orders", unit: "count", compute: (t) => g(t, "klaviyo:attributed_orders") },
  { key: "new_subscribers", label: "New Subscribers", unit: "count", compute: (t) => g(t, "klaviyo:new_subscribers") },
  { key: "unsubscribes", label: "Unsubscribes", unit: "count", compute: (t) => g(t, "klaviyo:unsubscribes"), lowerIsBetter: true },
  { key: "net_subscribers", label: "Net List Growth", unit: "count", compute: (t) => g(t, "klaviyo:net_subscribers") },
];

/** Change vs a comparison value, as a fraction; null when there's nothing to compare. */
export function delta(current: number | undefined, before: number | undefined): number | null {
  if (current === undefined || before === undefined || before === 0) return null;
  return (current - before) / Math.abs(before);
}
