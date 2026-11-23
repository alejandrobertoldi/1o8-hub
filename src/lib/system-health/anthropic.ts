import Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte, ilike } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminEventLog, seoSettings } from "@/lib/db/schema";
import { MODEL_RATES, computeCostUsd } from "@/lib/seo/pricing";

/**
 * The Claude API account behind ANTHROPIC_API_KEY, for System Health.
 *
 * Anthropic has no API for the prepaid credit balance, so an admin types the
 * balance shown in the Claude Console (Billing) with its date, and the hub
 * subtracts what was spent since then:
 *  - with ANTHROPIC_ADMIN_KEY (an Admin API key, sk-ant-admin…), the real
 *    spend from Anthropic's cost report — it counts every app using the
 *    account, not just the hub;
 *  - without it, the hub's own logged Claude calls (an estimate from tokens).
 */

export const CREDIT_SETTING_KEY = "anthropic_credit";
export type AnthropicCredit = { amountUsd: number; asOf: string };

const CONSOLE_BILLING_URL = "https://platform.claude.com/settings/billing";

export function parseCredit(raw: string | null | undefined): AnthropicCredit | null {
  try {
    const v = JSON.parse(raw ?? "") as Partial<AnthropicCredit>;
    if (typeof v.amountUsd !== "number" || !Number.isFinite(v.amountUsd) || typeof v.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.asOf)) return null;
    return { amountUsd: v.amountUsd, asOf: v.asOf };
  } catch {
    return null;
  }
}

/** Does the key work? Listing models costs nothing. */
async function checkKey(): Promise<{ ok: boolean; error: string | null }> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  try {
    await new Anthropic({ timeout: 8_000, maxRetries: 0 }).models.list({ limit: 1 });
    return { ok: true, error: null };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The key was rejected (invalid or revoked)" };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "The key has no access" };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Anthropic answered ${e.status ?? "an error"}` };
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Anthropic" };
  }
}

/**
 * Real spend in USD from `starting` (YYYY-MM-DD) to now, from the Admin API's
 * daily cost report (amounts are in cents). Null without an admin key.
 */
async function adminCostSince(starting: string): Promise<{ usd: number | null; error: string | null }> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) return { usd: null, error: null };
  let cents = 0;
  let page: string | null = null;
  try {
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ starting_at: `${starting}T00:00:00Z`, ending_at: new Date().toISOString(), limit: "31" });
      if (page) q.set("page", page);
      const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { usd: null, error: `Cost report answered ${res.status}` };
      const body = (await res.json()) as { data?: { results?: { amount?: string }[] }[]; has_more?: boolean; next_page?: string | null };
      for (const bucket of body.data ?? []) for (const r of bucket.results ?? []) cents += Number(r.amount ?? 0) || 0;
      if (!body.has_more || !body.next_page) break;
      page = body.next_page;
    }
    return { usd: cents / 100, error: null };
  } catch (e) {
    return { usd: null, error: e instanceof Error ? e.message : "Cost report failed" };
  }
}

/** Estimated spend from the hub's own logged Claude calls since `starting`. */
async function hubSpendSince(starting: string): Promise<number> {
  const rows = await db
    .select({ detail: adminEventLog.detail })
    .from(adminEventLog)
    .where(and(ilike(adminEventLog.action, "claude:%"), gte(adminEventLog.createdAt, new Date(`${starting}T00:00:00Z`))));
  let usd = 0;
  for (const r of rows) {
    const usage = (r.detail?.usage ?? null) as Record<string, number> | null;
    const model = String(r.detail?.model ?? "");
    if (!usage || !MODEL_RATES[model]) continue;
    usd += computeCostUsd(model, {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    });
  }
  return usd;
}

export async function anthropicAccount() {
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const [key, settingRow] = await Promise.all([
    checkKey(),
    db.select({ value: seoSettings.value, updatedBy: seoSettings.updatedBy }).from(seoSettings).where(eq(seoSettings.key, CREDIT_SETTING_KEY)).limit(1).then((r) => r[0] ?? null),
  ]);
  const credit = parseCredit(settingRow?.value);
  const [month, sinceCredit, hubSince] = await Promise.all([
    adminCostSince(monthStart),
    credit ? adminCostSince(credit.asOf) : Promise.resolve({ usd: null, error: null }),
    credit ? hubSpendSince(credit.asOf) : Promise.resolve(null),
  ]);
  const spentSinceCredit = sinceCredit.usd ?? hubSince;
  return {
    key,
    adminKeyConfigured: !!process.env.ANTHROPIC_ADMIN_KEY,
    adminError: month.error ?? sinceCredit.error,
    /** Real spend this calendar month (Admin API), when available. */
    monthSpendUsd: month.usd,
    credit: credit ? { ...credit, updatedBy: settingRow?.updatedBy ?? "" } : null,
    spentSinceCreditUsd: spentSinceCredit,
    spendSource: sinceCredit.usd !== null ? ("anthropic" as const) : ("hub" as const),
    remainingUsd: credit && spentSinceCredit !== null ? credit.amountUsd - spentSinceCredit : null,
    billingUrl: CONSOLE_BILLING_URL,
  };
}
