import { TEAM_ROLES } from "@/lib/constants";
import type { ClientKpi } from "@/lib/clients/kpis";
import { kpiValue, isRate, parseTarget, type KpiUnit, type KpiValue, type Totals } from "./values";

/**
 * Sales Summary (owners): every client's sales, traffic, paid media and
 * email in one place — MarketFoundry's Amazon "Sales Summary" rebuilt on
 * 1o8's own sources (Shopify, GA4, Meta, Google Ads, Klaviyo). Pure; the
 * rows reuse the Main KPI catalog maths so numbers match everywhere.
 */

export type SummarySection = "Sales" | "Traffic" | "Paid Media" | "Email";

export type SummaryRow = {
  key: string;
  label: string;
  section: SummarySection;
  value: (t: Totals) => KpiValue | null;
  lowerIsBetter?: boolean;
  /** Main KPI catalog key whose target is this row's goal. */
  goalKey?: string;
};

const fromCatalog = (key: string) => (t: Totals) => kpiValue(key, t);
const get = (t: Totals, k: string) => (k in t ? t[k] : undefined);
const val = (value: number | undefined, unit: KpiUnit, basis: string): KpiValue | null =>
  value === undefined || !Number.isFinite(value) ? null : { value, unit, basis };

export const SUMMARY_ROWS: SummaryRow[] = [
  { key: "net_sales", label: "Net Sales", section: "Sales", value: fromCatalog("net_sales"), goalKey: "net_sales" },
  { key: "orders", label: "Orders", section: "Sales", value: fromCatalog("orders"), goalKey: "orders" },
  { key: "aov", label: "Average Order Value", section: "Sales", value: fromCatalog("aov"), goalKey: "aov" },
  { key: "new_customers", label: "New Customer Orders", section: "Sales", value: fromCatalog("new_customers"), goalKey: "new_customers" },
  { key: "returning_customer_rate", label: "Returning Customer Rate", section: "Sales", value: fromCatalog("returning_customer_rate"), goalKey: "returning_customer_rate" },
  { key: "sessions", label: "Sessions", section: "Traffic", value: fromCatalog("sessions"), goalKey: "sessions" },
  { key: "conversion_rate", label: "Conversion Rate", section: "Traffic", value: fromCatalog("conversion_rate"), goalKey: "conversion_rate" },
  { key: "key_events", label: "Key Events (leads, bookings…)", section: "Traffic", value: (t) => val(get(t, "ga4:key_events"), "count", "GA4 key events"), goalKey: "website_leads" },
  { key: "ad_spend", label: "Ad Spend", section: "Paid Media", value: fromCatalog("ad_spend"), goalKey: "ad_spend" },
  { key: "website_roas", label: "Platform ROAS", section: "Paid Media", value: fromCatalog("website_roas"), goalKey: "website_roas" },
  { key: "blended_roas", label: "MER (Blended ROAS)", section: "Paid Media", value: fromCatalog("blended_roas"), goalKey: "blended_roas" },
  { key: "cac", label: "CAC", section: "Paid Media", value: fromCatalog("cac"), lowerIsBetter: true, goalKey: "cac" },
  { key: "email_revenue", label: "Email & SMS Revenue", section: "Email", value: fromCatalog("email_revenue"), goalKey: "email_revenue" },
  {
    key: "email_share",
    label: "Email Share of Revenue",
    section: "Email",
    value: (t) => {
      const email = get(t, "klaviyo:attributed_revenue");
      const store = get(t, "shopify:net_sales") ?? get(t, "klaviyo:store_revenue");
      return val(email !== undefined && store ? email / store : undefined, "percent", "Klaviyo ÷ store revenue");
    },
  },
  { key: "email_flow_vs_campaign", label: "Flow Share of Email Revenue", section: "Email", value: fromCatalog("email_flow_vs_campaign"), goalKey: "email_flow_vs_campaign" },
  { key: "email_engagement", label: "Open Rate", section: "Email", value: fromCatalog("email_engagement"), goalKey: "email_engagement" },
  { key: "email_list_growth", label: "Net List Growth", section: "Email", value: fromCatalog("email_list_growth"), goalKey: "email_list_growth" },
];

export const SUMMARY_SECTIONS: SummarySection[] = ["Sales", "Traffic", "Paid Media", "Email"];

/** Averages (rates, AOV, CAC) compare as-is; totals scale with the number of days. */
export const isAverage = (key: string, unit: KpiUnit) => isRate(unit) || key === "aov" || key === "cac";

/**
 * A row's goal for a range of `days`, from the client's Main KPI target
 * (a monthly figure): totals prorated by days (÷ 30.44 × days), averages as-is.
 * Null when the client has no target for it.
 */
export function rowGoal(row: SummaryRow, unit: KpiUnit, kpis: ClientKpi[], days: number): number | null {
  const target = kpis.find((k) => k.key === row.goalKey)?.target;
  const monthly = parseTarget(target, unit);
  if (monthly === null) return null;
  return isAverage(row.key, unit) ? monthly : (monthly / 30.44) * days;
}

export type TeamMember = { name: string; roles: string[]; level: 1 | 2 | 3 };

/** Strategy on top, account/project management under it, then the specialists. */
const LEVEL: Record<string, 1 | 2 | 3> = {
  "Executive Strategist": 1,
  "Account Manager": 2,
  "Project Manager": 2,
};

/** The client's 1o8 team from its AAC role columns, one entry per person (all their roles). */
export function clientTeam(raw: Record<string, string>): TeamMember[] {
  const byName = new Map<string, string[]>();
  for (const [field, role] of Object.entries(TEAM_ROLES)) {
    for (const name of (raw[field] ?? "").split(/[,;/]/).map((s) => s.trim()).filter(Boolean)) {
      byName.set(name, [...(byName.get(name) ?? []), role]);
    }
  }
  return [...byName].map(([name, roles]) => ({
    name,
    roles,
    level: roles.reduce<1 | 2 | 3>((lvl, r) => Math.min(lvl, LEVEL[r] ?? 3) as 1 | 2 | 3, 3),
  }));
}

/** "https://drive.google.com/file/d/<id>/view" (brand guidelines logo) → the Drive file id. */
export function driveFileId(url: string | null | undefined): string | null {
  return /\/d\/([A-Za-z0-9_-]{10,})/.exec(url ?? "")?.[1] ?? /[?&]id=([A-Za-z0-9_-]{10,})/.exec(url ?? "")?.[1] ?? null;
}
