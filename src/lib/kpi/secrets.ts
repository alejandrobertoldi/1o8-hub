import { eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";
import { decryptPii, encryptPii } from "@/lib/crypto/pii";

/**
 * API keys pasted into the hub for KPI sources (Meta system user token, each
 * client's Klaviyo private key), sealed in integration_tokens. Never sent
 * back to the browser — the UI only learns whether one is set.
 */

export const metaProvider = "meta";
export const klaviyoProvider = (clientIdCode: string) => `klaviyo:${clientIdCode.toUpperCase()}`;

export async function saveSecret(provider: string, secret: string, userId: string, meta: Record<string, unknown> = {}) {
  const sealed = encryptPii(secret);
  const values = { sealed: sealed.ciphertext, keyVersion: sealed.keyVersion, expiresAt: null, meta, connectedBy: userId, updatedAt: new Date() };
  await db.insert(integrationTokens).values({ provider, ...values }).onConflictDoUpdate({ target: integrationTokens.provider, set: values });
}

export async function readSecret(provider: string): Promise<string | null> {
  const [row] = await db.select().from(integrationTokens).where(eq(integrationTokens.provider, provider)).limit(1);
  return row ? decryptPii(row.sealed, row.keyVersion) : null;
}

export async function deleteSecret(provider: string) {
  await db.delete(integrationTokens).where(eq(integrationTokens.provider, provider));
}

export async function secretInfo(provider: string): Promise<{ updatedAt: Date; meta: Record<string, unknown> } | null> {
  const [row] = await db
    .select({ updatedAt: integrationTokens.updatedAt, meta: integrationTokens.meta })
    .from(integrationTokens)
    .where(eq(integrationTokens.provider, provider))
    .limit(1);
  return row ? { updatedAt: row.updatedAt, meta: (row.meta ?? {}) as Record<string, unknown> } : null;
}

/** Client codes that have a Klaviyo key saved. */
export async function clientsWithKlaviyo(): Promise<Set<string>> {
  const rows = await db.select({ provider: integrationTokens.provider }).from(integrationTokens).where(like(integrationTokens.provider, "klaviyo:%"));
  return new Set(rows.map((r) => r.provider.slice("klaviyo:".length)));
}
