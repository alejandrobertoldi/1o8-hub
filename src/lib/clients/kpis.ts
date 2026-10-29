/**
 * Main KPIs per client, picked from a catalog instead of free text. Stored on
 * the client's raw_data as JSON under MainKPIs (hub only); the readable list
 * is also written to the AAC sheet's "Main KPI" column so the sheet keeps
 * showing it. Each KPI names where its number comes from, so the hub can
 * fill them as sources get connected (Shopify first). Pure; unit-tested.
 */

export type KpiSource = "shopify" | "shopify_ads" | "ads" | "ga4" | "retail" | "email" | "social" | "other";

export type KpiDef = { key: string; label: string; source: KpiSource; hint?: string };

export const KPI_SOURCE_LABELS: Record<KpiSource, string> = {
  shopify: "Shopify",
  shopify_ads: "Shopify + ad spend",
  ads: "Ad platforms",
  ga4: "Google Analytics",
  retail: "Retail media",
  email: "Email (Klaviyo)",
  social: "Social",
  other: "Other",
};

export const KPI_CATALOG: readonly KpiDef[] = [
  { key: "net_sales", label: "Net Sales", source: "shopify" },
  { key: "gross_sales", label: "Gross Sales", source: "shopify" },
  { key: "orders", label: "Orders", source: "shopify" },
  { key: "aov", label: "Average Order Value", source: "shopify" },
  { key: "conversion_rate", label: "Conversion Rate", source: "shopify", hint: "Orders ÷ sessions (Shopify analytics or GA4)" },
  { key: "new_customers", label: "New Customers", source: "shopify" },
  { key: "new_customer_sales", label: "New Customer Sales", source: "shopify" },
  { key: "returning_customer_rate", label: "Returning Customer Rate", source: "shopify" },
  { key: "units_sold", label: "Units Sold", source: "shopify" },
  { key: "returns", label: "Returns / Refunds", source: "shopify" },
  { key: "blended_roas", label: "Blended ROAS (MER)", source: "shopify_ads", hint: "Store revenue ÷ total marketing spend" },
  { key: "cac", label: "CAC", source: "shopify_ads", hint: "Marketing spend ÷ new customers" },
  { key: "website_roas", label: "Website ROAS", source: "ads" },
  { key: "prospecting_roas", label: "Prospecting ROAS", source: "ads" },
  { key: "ad_spend", label: "Ad Spend", source: "ads" },
  { key: "instacart_roas", label: "Instacart ROAS", source: "retail" },
  { key: "target_roas", label: "Target (retailer) ROAS", source: "retail" },
  { key: "website_leads", label: "Website Leads", source: "ga4" },
  { key: "bookings", label: "Bookings / Classes Booked", source: "ga4" },
  { key: "memberships_sold", label: "Memberships Sold", source: "ga4" },
  { key: "course_registrations", label: "Course Registrations", source: "ga4" },
  { key: "sessions", label: "Website Sessions", source: "ga4" },
  { key: "email_revenue", label: "Email Revenue", source: "email" },
  { key: "email_list_growth", label: "Email List Growth", source: "email" },
  { key: "email_deliverability", label: "Email Deliverability", source: "email" },
  { key: "email_engagement", label: "Email Engagement", source: "email" },
  { key: "social_followers", label: "Social Followers", source: "social" },
  { key: "social_engagement", label: "Social Engagement", source: "social" },
  { key: "custom", label: "Custom KPI", source: "other" },
];

const BY_KEY = new Map(KPI_CATALOG.map((k) => [k.key, k]));
export const kpiDef = (key: string): KpiDef | undefined => BY_KEY.get(key);

/** A client's KPI: catalog key, optional target ("$150k / mo", "4.0x"), note ("USA and Canada"), custom label. */
export type ClientKpi = { key: string; label?: string; target?: string; note?: string };

export const MAIN_KPIS_FIELD = "MainKPIs";
export const MAIN_KPI_SHEET_FIELD = "Main KPI";

export function kpiLabel(k: ClientKpi): string {
  if (k.key === "custom") return k.label?.trim() || "Custom KPI";
  return kpiDef(k.key)?.label ?? k.label ?? k.key;
}

export function parseClientKpis(raw: string | undefined | null): ClientKpi[] {
  if (!raw?.trim()) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((k): k is ClientKpi => !!k && typeof k === "object" && typeof (k as ClientKpi).key === "string")
      .map((k) => ({
        key: k.key,
        ...(k.label ? { label: String(k.label) } : {}),
        ...(k.target ? { target: String(k.target) } : {}),
        ...(k.note ? { note: String(k.note) } : {}),
      }));
  } catch {
    return [];
  }
}

export const serializeClientKpis = (kpis: ClientKpi[]) => JSON.stringify(kpis);

/** The readable list the AAC sheet's "Main KPI" column shows: "1- Net Sales · target $150k / mo". */
export function kpisSheetText(kpis: ClientKpi[]): string {
  return kpis
    .map((k, i) => {
      const extra = [k.note?.trim() ? `(${k.note.trim()})` : "", k.target?.trim() ? `· target ${k.target.trim()}` : ""].filter(Boolean).join(" ");
      return `${i + 1}- ${kpiLabel(k)}${extra ? ` ${extra}` : ""}`;
    })
    .join("\n");
}

/** Old free-text phrasing → catalog key, most specific first. */
const SUGGEST: [RegExp, string][] = [
  [/blended[^\n]*roas|\bmer\b/i, "blended_roas"],
  [/instacart/i, "instacart_roas"],
  [/target\s+roas/i, "target_roas"],
  [/prospecting\s+roas/i, "prospecting_roas"],
  [/web\s*s?ite\s+roas|adspend\s+roas|ad\s*spend\s+roas/i, "website_roas"],
  [/new\s+(users?|customers?)\s+sales/i, "new_customer_sales"],
  [/net\s+sales/i, "net_sales"],
  [/gross\s+sales/i, "gross_sales"],
  [/conversion\s+rate/i, "conversion_rate"],
  [/\bcac\b/i, "cac"],
  [/\baov\b|average\s+order/i, "aov"],
  [/lead/i, "website_leads"],
  [/membership/i, "memberships_sold"],
  [/class(es)?\s+booked|booking/i, "bookings"],
  [/course\s+registration/i, "course_registrations"],
  [/list\s+growth/i, "email_list_growth"],
  [/deliverab/i, "email_deliverability"],
  [/email\s+engagement/i, "email_engagement"],
  [/followers/i, "social_followers"],
  [/social\s+engagement/i, "social_engagement"],
];

/** Catalog KPIs the old free-text "Main KPI" cell mentions, in the order they appear. */
export function suggestKpisFromText(text: string | undefined | null): ClientKpi[] {
  if (!text?.trim()) return [];
  const found: { key: string; at: number }[] = [];
  for (const [re, key] of SUGGEST) {
    const m = re.exec(text);
    if (m && !found.some((f) => f.key === key)) found.push({ key, at: m.index });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => ({ key: f.key }));
}
