import { metaProvider, readSecret } from "./secrets";
import type { DailyValue } from "./ga4";

/**
 * Meta ads for the Main KPIs, through a system user of 1o8's Business
 * Manager: its token (ads_read, never expires) is pasted once in Sync &
 * Export → KPIs, and each client's ad account is picked on its profile.
 */

const VERSION = () => process.env.META_API_VERSION || "v25.0";
const graph = (path: string, params: Record<string, string>) => `https://graph.facebook.com/${VERSION()}/${path}?${new URLSearchParams(params)}`;

async function token(): Promise<string> {
  const t = await readSecret(metaProvider);
  if (!t) throw new Error("Meta isn't connected");
  return t;
}

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error ?? {}) as { message?: string };
    throw new Error(`Meta: ${err.message ?? `HTTP ${res.status}`}`);
  }
  return json;
}

export type MetaAdAccount = { id: string; name: string };

/** Ad accounts the system user can read (its assigned assets). */
export async function listMetaAdAccounts(accessToken?: string): Promise<MetaAdAccount[]> {
  const t = accessToken ?? (await token());
  const out: MetaAdAccount[] = [];
  let url: string | undefined = graph("me/adaccounts", { fields: "name,account_id", limit: "200", access_token: t });
  while (url) {
    const json = await getJson(url);
    for (const a of (json.data ?? []) as { account_id?: string; name?: string }[]) {
      if (a.account_id) out.push({ id: a.account_id, name: a.name ?? a.account_id });
    }
    url = ((json.paging ?? {}) as { next?: string }).next;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

type InsightRow = { date_start?: string; spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[]; action_values?: { action_type: string; value: string }[] };

/** The purchase figure Meta reports, preferring its cross-surface total. */
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
function purchase(list: InsightRow["actions"]): number {
  for (const type of PURCHASE_TYPES) {
    const hit = list?.find((a) => a.action_type === type);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

/** Pure: insights rows (time_increment=1) → daily values. */
export function parseMetaInsights(rows: InsightRow[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const r of rows) {
    if (!r.date_start) continue;
    const day = r.date_start;
    out.push(
      { day, metric: "spend", value: Number(r.spend) || 0 },
      { day, metric: "impressions", value: Number(r.impressions) || 0 },
      { day, metric: "clicks", value: Number(r.clicks) || 0 },
      { day, metric: "purchases", value: purchase(r.actions) },
      { day, metric: "purchase_value", value: purchase(r.action_values) },
    );
  }
  return out;
}

/** Daily account-level spend and purchases for one ad account (dates inclusive). */
export async function fetchMetaDaily(adAccountId: string, from: string, to: string): Promise<DailyValue[]> {
  const t = await token();
  const rows: InsightRow[] = [];
  let url: string | undefined = graph(`act_${adAccountId.replace(/^act_/, "")}/insights`, {
    level: "account",
    time_increment: "1",
    time_range: JSON.stringify({ since: from, until: to }),
    fields: "spend,impressions,clicks,actions,action_values",
    limit: "500",
    access_token: t,
  });
  while (url) {
    const json = await getJson(url);
    rows.push(...((json.data ?? []) as InsightRow[]));
    url = ((json.paging ?? {}) as { next?: string }).next;
  }
  return parseMetaInsights(rows);
}
