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

/** The value of a catalog KPI over a period, or null when its sources aren't connected yet. */
export function kpiValue(key: string, t: Totals): KpiValue | null {
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
      return v(get(t, "shopify:new_customers"), "count", "Shopify");
    case "blended_roas":
      return v(div(shopifyNet, get(t, "meta:spend")), "ratio", "Shopify net sales ÷ Meta spend");
    case "prospecting_roas":
      return null;
    case "cac":
      return v(div(get(t, "meta:spend"), get(t, "shopify:new_customers")), "money", "Meta spend ÷ Shopify new customers");
    case "website_roas":
      return v(div(get(t, "meta:purchase_value"), get(t, "meta:spend")), "ratio", "Meta");
    case "ad_spend":
      return v(get(t, "meta:spend"), "money", "Meta");
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
    default:
      return null;
  }
}

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
    case "money":
      return v.value >= 10_000 ? `$${(v.value / 1000).toFixed(1)}k` : `$${v.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    case "percent":
      return `${(v.value * 100).toFixed(2)}%`;
    case "ratio":
      return `${v.value.toFixed(2)}x`;
    default:
      return Math.round(v.value).toLocaleString("en-US");
  }
}
