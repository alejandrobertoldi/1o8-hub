import { googleAdsTotals, type KpiUnit, type Totals } from "./values";

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
const ga = googleAdsTotals;
const totalSpend = (t: Totals) => sum(g(t, "meta:spend"), ga(t).cost);
const totalValue = (t: Totals) => sum(g(t, "meta:purchase_value"), ga(t).value);
const totalPurchases = (t: Totals) => sum(g(t, "meta:purchases"), ga(t).purchases);

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
  { key: "spend", label: "Ad Spend", unit: "money", compute: (t) => ga(t).cost },
  {
    key: "revenue",
    label: "Conversion Value",
    unit: "money",
    compute: (t) => ga(t).value,
    hint: "Google Ads conversion value (or, without the Google Ads connection, GA4 revenue from google / cpc sessions)",
  },
  { key: "roas", label: "ROAS", unit: "ratio", compute: (t) => div(ga(t).value, ga(t).cost) },
  { key: "purchases", label: "Conversions", unit: "count", compute: (t) => ga(t).purchases },
  { key: "cpa", label: "Cost per Conversion", unit: "money", compute: (t) => div(ga(t).cost, ga(t).purchases), lowerIsBetter: true },
  { key: "cpc", label: "CPC", unit: "money", compute: (t) => div(ga(t).cost, ga(t).clicks), lowerIsBetter: true },
  { key: "ctr", label: "CTR", unit: "percent", compute: (t) => div(ga(t).clicks, ga(t).impressions) },
];

/** Shopify's own sales figures (net sales = gross − discounts − returns). Discounts and returns come in negative. */
export const SALES: ReportMetric[] = [
  { key: "net_sales", label: "Net Sales", unit: "money", compute: (t) => g(t, "shopify:net_sales") },
  { key: "orders", label: "Orders", unit: "count", compute: (t) => g(t, "shopify:orders") },
  { key: "aov", label: "Average Order Value", unit: "money", compute: (t) => div(g(t, "shopify:net_sales"), g(t, "shopify:orders")) },
  { key: "gross_sales", label: "Gross Sales", unit: "money", compute: (t) => g(t, "shopify:gross_sales") },
  { key: "discounts", label: "Discounts", unit: "money", compute: (t) => g(t, "shopify:discounts") },
  { key: "returns", label: "Returns", unit: "money", compute: (t) => g(t, "shopify:returns") },
  { key: "new_customer_sales", label: "New Customer Sales", unit: "money", compute: (t) => g(t, "shopify:new_customer_sales") },
  { key: "new_customer_orders", label: "New Customer Orders", unit: "count", compute: (t) => g(t, "shopify:new_customers"), hint: "Orders from first-time customers" },
  {
    key: "returning_rate",
    label: "Returning Customer Rate",
    unit: "percent",
    compute: (t) => {
      const orders = g(t, "shopify:orders");
      const fresh = g(t, "shopify:new_customers");
      return orders === undefined || fresh === undefined ? undefined : div(orders - fresh, orders);
    },
    hint: "Share of orders from returning customers",
  },
  { key: "cac", label: "CAC", unit: "money", compute: (t) => div(totalSpend(t), g(t, "shopify:new_customers")), lowerIsBetter: true, hint: "Ad spend (Meta + Google) ÷ new customer orders" },
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
  { key: "flow_revenue", label: "Flow Revenue", unit: "money", compute: (t) => g(t, "klaviyo:flow_revenue") },
  {
    key: "campaign_revenue",
    label: "Campaign Revenue",
    unit: "money",
    compute: (t) => {
      const total = g(t, "klaviyo:attributed_revenue");
      const flows = g(t, "klaviyo:flow_revenue");
      return total === undefined || flows === undefined ? undefined : Math.max(total - flows, 0);
    },
    hint: "Email + SMS revenue not from flows",
  },
  { key: "attributed_orders", label: "Attributed Orders", unit: "count", compute: (t) => g(t, "klaviyo:attributed_orders") },
  { key: "emails_delivered", label: "Emails Delivered", unit: "count", compute: (t) => g(t, "klaviyo:emails_delivered") },
  { key: "open_rate", label: "Open Rate", unit: "percent", compute: (t) => div(g(t, "klaviyo:emails_opened"), g(t, "klaviyo:emails_delivered")), hint: "Unique opens ÷ delivered" },
  { key: "click_rate", label: "Click Rate", unit: "percent", compute: (t) => div(g(t, "klaviyo:emails_clicked"), g(t, "klaviyo:emails_delivered")), hint: "Unique clicks ÷ delivered" },
  {
    key: "bounce_rate",
    label: "Bounce Rate",
    unit: "percent",
    compute: (t) => {
      const delivered = g(t, "klaviyo:emails_delivered");
      return delivered === undefined ? undefined : div(g(t, "klaviyo:emails_bounced") ?? 0, delivered + (g(t, "klaviyo:emails_bounced") ?? 0));
    },
    lowerIsBetter: true,
  },
  { key: "new_subscribers", label: "New Subscribers", unit: "count", compute: (t) => g(t, "klaviyo:new_subscribers") },
  { key: "unsubscribes", label: "Unsubscribes", unit: "count", compute: (t) => g(t, "klaviyo:unsubscribes"), lowerIsBetter: true },
  { key: "net_subscribers", label: "Net List Growth", unit: "count", compute: (t) => g(t, "klaviyo:net_subscribers") },
];

/** Change vs a comparison value, as a fraction; null when there's nothing to compare. */
export function delta(current: number | undefined, before: number | undefined): number | null {
  if (current === undefined || before === undefined || before === 0) return null;
  return (current - before) / Math.abs(before);
}
