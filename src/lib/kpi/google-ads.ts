import { googleAccessToken } from "./ga4";
import type { DailyValue } from "./ga4";

/**
 * Google Ads for the Main KPIs, straight from the Google Ads API: the Google
 * account connected for GA4 (analytics@1o8.agency, with the Google Ads
 * scope) reads every client account under 1o8's manager account (MCC).
 * Covers clients without GA4, and gives the platform's own numbers.
 *
 * Env: GOOGLE_ADS_DEVELOPER_TOKEN (1o8 MCC → Admin → API Center), optional
 * GOOGLE_ADS_LOGIN_CUSTOMER_ID (the MCC; found automatically when unset)
 * and GOOGLE_ADS_API_VERSION. The Google Ads API must be enabled in the
 * Cloud project of GOOGLE_CLIENT_ID.
 */

const VERSION = () => process.env.GOOGLE_ADS_API_VERSION || "v26";
const BASE = () => `https://googleads.googleapis.com/${VERSION()}`;
export const googleAdsConfigured = () => !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

/** "202-947-7492" / "2029477492" → "2029477492"; null when it isn't a 10-digit ID. */
export function normalizeCustomerId(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

async function call(path: string, body: unknown, loginCustomerId?: string): Promise<unknown> {
  const res = await fetch(`${BASE()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${await googleAccessToken()}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
      "Content-Type": "application/json",
      ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const err = (Array.isArray(json) ? json[0] : json) as { error?: { message?: string; status?: string; details?: { errors?: { message?: string }[] }[] } };
    const detail = err?.error?.details?.[0]?.errors?.[0]?.message ?? err?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || err?.error?.status === "PERMISSION_DENIED") {
      throw new Error(`Google Ads: ${detail} (connect Google again in Sync & Export → KPIs to grant Google Ads access)`);
    }
    throw new Error(`Google Ads: ${detail}`);
  }
  return json;
}

type Row = { segments?: { date?: string }; metrics?: Record<string, string | number | undefined>; customer?: { id?: string; manager?: boolean; descriptiveName?: string } };

/** GAQL through searchStream: every batch's rows. */
async function search(customerId: string, query: string, loginCustomerId?: string): Promise<Row[]> {
  const batches = (await call(`/customers/${customerId}/googleAds:searchStream`, { query }, loginCustomerId)) as { results?: Row[] }[];
  return (Array.isArray(batches) ? batches : []).flatMap((b) => b.results ?? []);
}

let mcc: Promise<string | null> | null = null;
/** 1o8's manager account: GOOGLE_ADS_LOGIN_CUSTOMER_ID, else the first manager the connected account can reach. */
function loginCustomerId(): Promise<string | null> {
  const fixed = normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  if (fixed) return Promise.resolve(fixed);
  mcc ??= (async () => {
    const { resourceNames = [] } = (await call("/customers:listAccessibleCustomers", undefined)) as { resourceNames?: string[] };
    for (const name of resourceNames) {
      const id = name.replace("customers/", "");
      const [row] = await search(id, "SELECT customer.id, customer.manager FROM customer LIMIT 1").catch(() => []);
      if (row?.customer?.manager) return id;
    }
    return null;
  })().catch((e) => {
    mcc = null;
    throw e;
  });
  return mcc;
}

const METRICS: Record<string, string> = {
  costMicros: "cost",
  clicks: "clicks",
  impressions: "impressions",
  conversions: "conversions",
  conversionsValue: "conversion_value",
};

/** Pure: searchStream rows (one per day) → daily values; cost comes in micros. */
export function parseGoogleAdsRows(rows: Row[]): DailyValue[] {
  const out: DailyValue[] = [];
  for (const r of rows) {
    const day = r.segments?.date;
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    for (const [field, metric] of Object.entries(METRICS)) {
      const raw = r.metrics?.[field];
      if (raw === undefined) continue;
      const value = Number(raw) / (field === "costMicros" ? 1_000_000 : 1);
      if (Number.isFinite(value)) out.push({ day, metric, value });
    }
  }
  return out;
}

/** Daily spend, clicks, impressions, conversions and conversion value for one Google Ads account. */
export async function fetchGoogleAdsDaily(customerId: string, from: string, to: string): Promise<DailyValue[]> {
  const id = normalizeCustomerId(customerId);
  if (!id) throw new Error(`"${customerId}" isn't a Google Ads customer ID (123-456-7890)`);
  const login = await loginCustomerId();
  const rows = await search(
    id,
    `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}'`,
    login ?? undefined,
  );
  return parseGoogleAdsRows(rows);
}
