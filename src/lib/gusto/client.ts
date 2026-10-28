import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";
import { decryptPii, encryptPii } from "@/lib/crypto/pii";

/**
 * Gusto API access for 1o8's company (read-only use: employees, time off
 * requests, balances). OAuth app credentials come from env:
 *   GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET
 *   GUSTO_API_BASE      default https://api.gusto.com (demo: https://api.gusto-demo.com)
 *   GUSTO_API_VERSION   optional X-Gusto-API-Version header
 *   GUSTO_COMPANY_UUID  optional; otherwise read from the token on connect
 * An admin connects once (Sync & Export → Time Off → Connect Gusto); the
 * access + refresh tokens are sealed in integration_tokens and refreshed here.
 */

const PROVIDER = "gusto";
export const GUSTO_STATE_COOKIE = "gusto_oauth_state";
const base = () => (process.env.GUSTO_API_BASE || "https://api.gusto.com").replace(/\/$/, "");
export const gustoConfigured = () => !!process.env.GUSTO_CLIENT_ID && !!process.env.GUSTO_CLIENT_SECRET;
export const gustoRedirectUri = (origin: string) => `${origin}/api/integrations/gusto/callback`;

type Tokens = { access_token: string; refresh_token: string };
type TokenResponse = Tokens & { expires_in?: number };
export type GustoConnection = { companyUuid: string | null; companyName: string | null; expiresAt: Date | null; updatedAt: Date };

export function gustoAuthorizeUrl(origin: string, state: string): string {
  const q = new URLSearchParams({ client_id: process.env.GUSTO_CLIENT_ID ?? "", redirect_uri: gustoRedirectUri(origin), response_type: "code", state });
  return `${base()}/oauth/authorize?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${base()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: process.env.GUSTO_CLIENT_ID, client_secret: process.env.GUSTO_CLIENT_SECRET, ...body }),
  });
  if (!res.ok) throw new Error(`Gusto token request failed (HTTP ${res.status})`);
  return (await res.json()) as TokenResponse;
}

async function saveTokens(t: TokenResponse, meta?: Record<string, unknown>, connectedBy?: string) {
  const sealed = encryptPii(JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token }));
  const values = {
    sealed: sealed.ciphertext,
    keyVersion: sealed.keyVersion,
    expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
    updatedAt: new Date(),
    ...(meta ? { meta } : {}),
    ...(connectedBy ? { connectedBy } : {}),
  };
  await db
    .insert(integrationTokens)
    .values({ provider: PROVIDER, ...values })
    .onConflictDoUpdate({ target: integrationTokens.provider, set: values });
}

/** OAuth callback: trade the code for tokens and remember which company they're for. */
export async function connectGusto(origin: string, code: string, userId: string): Promise<GustoConnection> {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: gustoRedirectUri(origin) });
  await saveTokens(t, {}, userId);
  const info = (await gustoGet("/v1/token_info").catch(() => null)) as { resource?: { type?: string; uuid?: string } } | null;
  const companyUuid = process.env.GUSTO_COMPANY_UUID || (info?.resource?.type === "Company" ? info.resource.uuid ?? null : null);
  const company = companyUuid ? ((await gustoGet(`/v1/companies/${companyUuid}`).catch(() => null)) as { name?: string } | null) : null;
  await db.update(integrationTokens).set({ meta: { companyUuid, companyName: company?.name ?? null } }).where(eq(integrationTokens.provider, PROVIDER));
  return (await gustoConnection())!;
}

export async function gustoConnection(): Promise<GustoConnection | null> {
  const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, PROVIDER)).limit(1);
  if (!row) return null;
  const meta = (row.meta ?? {}) as { companyUuid?: string | null; companyName?: string | null };
  return {
    companyUuid: process.env.GUSTO_COMPANY_UUID || meta.companyUuid || null,
    companyName: meta.companyName ?? null,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  };
}

export async function disconnectGusto(): Promise<void> {
  await db.delete(integrationTokens).where(eq(integrationTokens.provider, PROVIDER));
}

/** A valid access token, refreshed (and the rotated refresh token saved) when it's about to expire. */
async function accessToken(): Promise<string> {
  const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, PROVIDER)).limit(1);
  if (!row) throw new Error("Gusto isn't connected");
  const tokens = JSON.parse(decryptPii(row.sealed, row.keyVersion)) as Tokens;
  if (!row.expiresAt || row.expiresAt.getTime() - Date.now() > 60_000) return tokens.access_token;
  const fresh = await tokenRequest({ refresh_token: tokens.refresh_token, grant_type: "refresh_token" });
  await saveTokens(fresh);
  return fresh.access_token;
}

export async function gustoGet(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = `${base()}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}`, Accept: "application/json" };
  if (process.env.GUSTO_API_VERSION) headers["X-Gusto-API-Version"] = process.env.GUSTO_API_VERSION;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Gusto ${path} failed (HTTP ${res.status})`);
  return res.json();
}

/** Every page of a list endpoint (Gusto pages with ?page=&per=). */
export async function gustoGetAll(path: string, params: Record<string, string> = {}): Promise<unknown[]> {
  const per = 100;
  const all: unknown[] = [];
  for (let page = 1; page <= 50; page++) {
    const data = await gustoGet(path, { ...params, page: String(page), per: String(per) });
    const list = Array.isArray(data) ? data : [];
    all.push(...list);
    if (list.length < per) break;
  }
  return all;
}
