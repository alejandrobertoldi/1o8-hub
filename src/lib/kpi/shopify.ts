import { createHmac, timingSafeEqual } from "node:crypto";
import { readSecret, saveSecret, secretInfo } from "./secrets";
import type { DailyValue } from "./ga4";

/**
 * Shopify for the Main KPIs, through 1o8's "1o8 Hub" app (custom
 * distribution, read-only). A store installs it from its install link; the
 * hub then runs OAuth (authorization code grant, expiring offline token +
 * refresh token, sealed per shop) and reads daily sales with ShopifyQL —
 * the same net sales Shopify's own reports show.
 *
 * Env: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, optional SHOPIFY_API_VERSION.
 */

export const SHOPIFY_STATE_COOKIE = "shopify_oauth_state";
const SCOPES = "read_orders,read_all_orders,read_reports,read_products,read_customers";
const VERSION = () => process.env.SHOPIFY_API_VERSION || "2025-10";
export const shopifyConfigured = () => !!process.env.SHOPIFY_CLIENT_ID && !!process.env.SHOPIFY_CLIENT_SECRET;
export const shopifyProvider = (shop: string) => `shopify:${shop}`;

/** "brand.myshopify.com" from what people paste ("Brand.myshopify.com/", an admin URL…); null when it isn't one. */
export function normalizeShop(input: string | undefined | null): string | null {
  const s = (input ?? "").trim().toLowerCase();
  const admin = /admin\.shopify\.com\/store\/([a-z0-9-]+)/.exec(s);
  if (admin) return `${admin[1]}.myshopify.com`;
  const m = /([a-z0-9][a-z0-9-]*)\.myshopify\.com/.exec(s);
  return m ? `${m[1]}.myshopify.com` : null;
}

/** Shopify signs its redirects: HMAC-SHA256 of the sorted query (minus hmac) with the app secret. */
export function verifyShopifyHmac(params: URLSearchParams, secret = process.env.SHOPIFY_CLIENT_SECRET ?? ""): boolean {
  const hmac = params.get("hmac");
  if (!hmac || !secret) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return digest.length === hmac.length && timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

export const shopifyRedirectUri = (origin: string) => `${origin}/api/integrations/shopify/callback`;

export function shopifyAuthorizeUrl(shop: string, origin: string, state: string): string {
  const q = new URLSearchParams({ client_id: process.env.SHOPIFY_CLIENT_ID ?? "", scope: SCOPES, redirect_uri: shopifyRedirectUri(origin), state });
  return `https://${shop}/admin/oauth/authorize?${q}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number };

async function tokenRequest(shop: string, body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, ...body }),
  });
  if (!res.ok) throw new Error(`Shopify token request failed (HTTP ${res.status})`);
  return (await res.json()) as Tokens;
}

async function save(shop: string, t: Tokens, userId: string | null) {
  const expiresAt = t.expires_in ? Date.now() + t.expires_in * 1000 : null;
  await saveSecret(shopifyProvider(shop), JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token ?? null, expires_at: expiresAt }), userId, {
    expiresAt,
  });
}

/** OAuth callback: trade the code for an expiring offline token (+ refresh token). */
export async function connectShopify(shop: string, code: string, userId: string) {
  await save(shop, await tokenRequest(shop, { code, expiring: "1" }), userId);
}

/** A valid access token for a shop, refreshed when it's about to expire. */
async function accessToken(shop: string): Promise<string> {
  const raw = await readSecret(shopifyProvider(shop));
  if (!raw) throw new Error(`${shop} isn't connected`);
  const t = JSON.parse(raw) as { access_token: string; refresh_token: string | null; expires_at: number | null };
  if (!t.expires_at || t.expires_at - Date.now() > 5 * 60_000 || !t.refresh_token) return t.access_token;
  const fresh = await tokenRequest(shop, { grant_type: "refresh_token", refresh_token: t.refresh_token });
  await save(shop, fresh, null);
  return fresh.access_token;
}

export async function shopifyConnected(shop: string): Promise<boolean> {
  return !!(await secretInfo(shopifyProvider(shop)));
}

type QlTable = { columns?: { name: string }[]; rows?: Record<string, string | null>[] };

async function shopifyql(shop: string, ql: string): Promise<{ table: QlTable | null; parseErrors: string[] }> {
  const res = await fetch(`https://${shop}/admin/api/${VERSION()}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await accessToken(shop) },
    body: JSON.stringify({
      query: `query($q: String!) { shopifyqlQuery(query: $q) { tableData { columns { name } rows } parseErrors } }`,
      variables: { q: ql },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { shopifyqlQuery?: { tableData: QlTable | null; parseErrors: unknown } | null };
    errors?: { message: string }[];
  };
  if (!res.ok || json.errors?.length) throw new Error(`Shopify: ${json.errors?.[0]?.message ?? `HTTP ${res.status}`}`);
  const r = json.data?.shopifyqlQuery;
  const errs = r?.parseErrors;
  return { table: r?.tableData ?? null, parseErrors: Array.isArray(errs) ? errs.map(String) : errs ? [String(errs)] : [] };
}

const SALES_METRICS = ["gross_sales", "discounts", "returns", "net_sales", "orders"];

/** Pure: ShopifyQL TIMESERIES day rows → daily values (optionally renamed / filtered by a column). */
export function parseShopifyTable(table: QlTable | null, metrics: string[], rename: (m: string) => string = (m) => m, keep?: (row: Record<string, string | null>) => boolean): DailyValue[] {
  const out: DailyValue[] = [];
  for (const row of table?.rows ?? []) {
    if (keep && !keep(row)) continue;
    const day = String(row.day ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    for (const m of metrics) {
      const v = Number(row[m]);
      if (row[m] !== undefined && Number.isFinite(v)) out.push({ day, metric: rename(m), value: v });
    }
  }
  return out;
}

/**
 * Daily sales (gross, discounts, returns, net sales, orders) and, when the
 * store's ShopifyQL supports it, first-time customers' orders and net sales.
 */
export async function fetchShopifyDaily(shop: string, from: string, to: string): Promise<DailyValue[]> {
  const range = `SINCE ${from} UNTIL ${to}`;
  let sales = await shopifyql(shop, `FROM sales SHOW ${SALES_METRICS.join(", ")} TIMESERIES day ${range} ORDER BY day ASC`);
  let metrics = SALES_METRICS;
  if (sales.parseErrors.length) {
    // Older ShopifyQL vocabularies only know the core two.
    metrics = ["net_sales", "orders"];
    sales = await shopifyql(shop, `FROM sales SHOW ${metrics.join(", ")} TIMESERIES day ${range} ORDER BY day ASC`);
    if (sales.parseErrors.length) throw new Error(`ShopifyQL: ${sales.parseErrors[0]}`);
  }
  const out = parseShopifyTable(sales.table, metrics);

  const byType = await shopifyql(shop, `FROM sales SHOW net_sales, orders GROUP BY customer_type TIMESERIES day ${range} ORDER BY day ASC`).catch(() => null);
  if (byType && !byType.parseErrors.length) {
    const firstTime = (r: Record<string, string | null>) => /first|new/i.test(String(r.customer_type ?? ""));
    out.push(...parseShopifyTable(byType.table, ["net_sales", "orders"], (m) => (m === "orders" ? "new_customers" : "new_customer_sales"), firstTime));
  }
  return out;
}
