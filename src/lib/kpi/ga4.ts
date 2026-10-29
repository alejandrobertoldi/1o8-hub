import { eq } from "drizzle-orm";
import { google, type analyticsdata_v1beta } from "googleapis";
import { db } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";
import { decryptPii, encryptPii } from "@/lib/crypto/pii";
import { googleServiceAccount } from "@/lib/google-service-account";

/**
 * Google Analytics 4 for the Main KPIs. An admin connects, once, the Google
 * account that can see the clients' GA4 properties (Sync & Export → KPIs);
 * its refresh token is sealed in integration_tokens. Without it, the hub's
 * service account is used for any property it was added to as a Viewer.
 *
 * Uses the hub's Google OAuth client (GOOGLE_CLIENT_ID / SECRET); its
 * redirect URIs must include <hub>/api/integrations/google-analytics/callback,
 * and the Analytics Data + Admin APIs must be enabled in that Cloud project.
 */

const PROVIDER = "google_analytics";
export const GA_STATE_COOKIE = "ga_oauth_state";
const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

export const gaRedirectUri = (origin: string) => `${origin}/api/integrations/google-analytics/callback`;
export const gaOAuthConfigured = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

const oauthClient = (origin?: string) =>
  new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, origin ? gaRedirectUri(origin) : undefined);

export function gaAuthorizeUrl(origin: string, state: string): string {
  // offline + consent: Google only returns a refresh token on a fresh consent.
  return oauthClient(origin).generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES, state });
}

export async function connectGoogleAnalytics(origin: string, code: string, userId: string) {
  const client = oauthClient(origin);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token");
  client.setCredentials(tokens);
  const me = await google.oauth2({ version: "v2", auth: client }).userinfo.get().catch(() => null);
  const sealed = encryptPii(JSON.stringify({ refresh_token: tokens.refresh_token }));
  const values = {
    sealed: sealed.ciphertext,
    keyVersion: sealed.keyVersion,
    expiresAt: null,
    meta: { email: me?.data.email ?? null },
    connectedBy: userId,
    updatedAt: new Date(),
  };
  await db.insert(integrationTokens).values({ provider: PROVIDER, ...values }).onConflictDoUpdate({ target: integrationTokens.provider, set: values });
}

export async function gaConnection(): Promise<{ email: string | null; updatedAt: Date } | null> {
  const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, PROVIDER)).limit(1);
  return row ? { email: ((row.meta ?? {}) as { email?: string }).email ?? null, updatedAt: row.updatedAt } : null;
}

export async function disconnectGoogleAnalytics() {
  await db.delete(integrationTokens).where(eq(integrationTokens.provider, PROVIDER));
}

/** The connected account when there is one, else the service account. */
async function auth() {
  const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, PROVIDER)).limit(1);
  if (row) {
    const { refresh_token } = JSON.parse(decryptPii(row.sealed, row.keyVersion)) as { refresh_token: string };
    const client = oauthClient();
    client.setCredentials({ refresh_token });
    return client;
  }
  const sa = googleServiceAccount();
  if (!sa) throw new Error("Connect Google Analytics first");
  return new google.auth.JWT({ email: sa.client_email, key: sa.private_key, scopes: SCOPES });
}

export type Ga4Property = { id: string; name: string; account: string };

/** Every GA4 property the connected account (or service account) can read. */
export async function listGa4Properties(): Promise<Ga4Property[]> {
  const admin = google.analyticsadmin({ version: "v1beta", auth: await auth() });
  const out: Ga4Property[] = [];
  let pageToken: string | undefined;
  do {
    const res = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const a of res.data.accountSummaries ?? []) {
      for (const p of a.propertySummaries ?? []) {
        const id = p.property?.replace("properties/", "");
        if (id) out.push({ id, name: p.displayName ?? id, account: a.displayName ?? "" });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** GA4 metric → kpi_daily metric name. */
export const GA4_METRICS: Record<string, string> = {
  sessions: "sessions",
  totalUsers: "users",
  newUsers: "new_users",
  keyEvents: "key_events",
  ecommercePurchases: "purchases",
  purchaseRevenue: "purchase_revenue",
};

export type DailyValue = { day: string; metric: string; value: number };

/** Pure: GA4 runReport rows (date dimension, GA4_METRICS order) → daily values. */
export function parseGa4Report(data: analyticsdata_v1beta.Schema$RunReportResponse): DailyValue[] {
  const names = (data.metricHeaders ?? []).map((h) => GA4_METRICS[h.name ?? ""] ?? h.name ?? "");
  const out: DailyValue[] = [];
  for (const row of data.rows ?? []) {
    const raw = row.dimensionValues?.[0]?.value ?? "";
    if (!/^\d{8}$/.test(raw)) continue;
    const day = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    (row.metricValues ?? []).forEach((m, i) => {
      const value = Number(m.value);
      if (names[i] && Number.isFinite(value)) out.push({ day, metric: names[i], value });
    });
  }
  return out;
}

/** Daily GA4 totals for one property between two dates (inclusive). */
export async function fetchGa4Daily(propertyId: string, from: string, to: string): Promise<DailyValue[]> {
  const data = google.analyticsdata({ version: "v1beta", auth: await auth() });
  const res = await data.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }],
      metrics: Object.keys(GA4_METRICS).map((name) => ({ name })),
      limit: "1000",
    },
  });
  return parseGa4Report(res.data);
}
