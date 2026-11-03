import { and, desc, eq, gte, ilike, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aacSyncRuns, adminEventLog, asanaSyncState, kpiSyncRuns, readinessSnapshots, timeOffSyncRuns } from "@/lib/db/schema";
import { MODEL_RATES, computeCostUsd } from "@/lib/seo/pricing";
import type { KpiSyncReport } from "@/lib/kpi/sync";
import { SUPABASE_PLAN, parseJsonl, summarizeVercelCharges, usageLevel } from "./plans";

/** Every daily job runs once a day: older than this means the last one was missed. */
const STALE_MS = 26 * 3_600_000;

async function timed<T>(fn: () => Promise<T>, fallback: T, ms = 10_000): Promise<T> {
  return (await attempt(fn, fallback, ms)).value;
}

/** Like timed, but keeps why it failed so the page can say so instead of "Never". */
async function attempt<T>(fn: () => Promise<T>, fallback: T, ms = 10_000): Promise<{ value: T; error: string | null }> {
  return Promise.race([
    fn().then(
      (value) => ({ value, error: null }),
      (e) => ({ value: fallback, error: e instanceof Error ? e.message : String(e) }),
    ),
    new Promise<{ value: T; error: string }>((r) => setTimeout(() => r({ value: fallback, error: `No answer in -es` }), ms)),
  ]);
}

// ── Database (Supabase) ──────────────────────────────────────────────

export async function databaseHealth() {
  const start = Date.now();
  try {
    const [size] = await db.execute<{ bytes: string }>(sql`select pg_database_size(current_database())::text as bytes`);
    const latencyMs = Date.now() - start;
    const tables = await db.execute<{ name: string; bytes: string; rows: string }>(sql`
      select c.relname as name, pg_total_relation_size(c.oid)::text as bytes, greatest(c.reltuples, 0)::bigint::text as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
      limit 10`);
    const bytes = Number(size.bytes);
    return {
      ok: true as const,
      plan: SUPABASE_PLAN.name,
      latencyMs,
      bytes,
      limitBytes: SUPABASE_PLAN.databaseBytes,
      level: usageLevel(bytes, SUPABASE_PLAN.databaseBytes),
      tables: [...tables].map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: Number(t.rows) })),
    };
  } catch (e) {
    return { ok: false as const, plan: SUPABASE_PLAN.name, latencyMs: Date.now() - start, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

// ── Vercel (Hobby) ───────────────────────────────────────────────────

/**
 * The team whose usage to read: VERCEL_TEAM_ID when set, else the team the
 * token belongs to (a token scoped to one team, like "1o8-hub", lists only
 * that one). Without a team, Vercel looks at the personal account and answers
 * 404 "Plan not found".
 */
async function vercelTeamId(token: string): Promise<string | null> {
  if (process.env.VERCEL_TEAM_ID) return process.env.VERCEL_TEAM_ID;
  const res = await fetch("https://api.vercel.com/v2/teams?limit=20", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const { teams } = (await res.json()) as { teams?: { id: string; slug: string }[] };
  if (!teams?.length) return null;
  return (teams.find((t) => t.slug === (process.env.VERCEL_TEAM_SLUG ?? "1o8-hub")) ?? teams[0]).id;
}

/**
 * This month's usage from Vercel's billing API (GET /v1/billing/charges, FOCUS
 * JSONL). Needs VERCEL_API_TOKEN; VERCEL_TEAM_ID only if the project sits in a team.
 */
export async function vercelUsage() {
  const token = process.env.VERCEL_API_TOKEN;
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const period = { from: from.toISOString().slice(0, 10), to: now.toISOString().slice(0, 10) };
  if (!token) return { configured: false as const, plan: "Vercel Hobby", period };

  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  try {
    const teamId = await vercelTeamId(token);
    if (teamId) params.set("teamId", teamId);
    const res = await fetch(`https://api.vercel.com/v1/billing/charges?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Hobby has no billing plan behind the team, so the billing API answers
      // 404 "Plan not found" (seen 2026-11-03 with a valid team token). Not an
      // error to fix: usage is only in the dashboard until the team moves to Pro.
      if (res.status === 404 && /plan not found/i.test(body)) return { configured: true as const, plan: "Vercel Hobby", period, unavailable: true as const };
      return { configured: true as const, plan: "Vercel Hobby", period, error: `Vercel answered ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}` };
    }
    return { configured: true as const, plan: "Vercel Hobby", period, ...summarizeVercelCharges(parseJsonl(await res.text())) };
  } catch (e) {
    return { configured: true as const, plan: "Vercel Hobby", period, error: e instanceof Error ? e.message : "Could not reach Vercel" };
  }
}

// ── Daily jobs ───────────────────────────────────────────────────────

type Job = { key: string; label: string; schedule: string; lastSuccess: string | null; lastError: string | null; detail: string | null; status: "ok" | "stale" | "error" | "never" };

function job(key: string, label: string, schedule: string, lastSuccessIn: Date | string | null, lastError: string | null, detail: string | null = null): Job {
  // Aggregates (max()) can come back as text depending on the driver.
  const lastSuccess = lastSuccessIn == null ? null : new Date(lastSuccessIn);
  const status = lastError ? "error" : !lastSuccess ? "never" : Date.now() - lastSuccess.getTime() > STALE_MS ? "stale" : "ok";
  return { key, label, schedule, lastSuccess: lastSuccess?.toISOString() ?? null, lastError, detail, status };
}

export async function dailyJobs() {
  const [asanaQ, readinessQ, aacQ, timeOffQ, kpiQ] = await Promise.all([
    attempt(() => db.select().from(asanaSyncState).where(eq(asanaSyncState.id, 1)).limit(1).then((r) => r[0] ?? null), null),
    attempt(
      () =>
        db
          .select({ at: sql<string | null>`max(${readinessSnapshots.capturedAt})::text` })
          .from(readinessSnapshots)
          .then((r) => r[0]?.at ?? null),
      null,
    ),
    attempt(() => db.select().from(aacSyncRuns).where(eq(aacSyncRuns.dryRun, false)).orderBy(desc(aacSyncRuns.startedAt)).limit(1).then((r) => r[0] ?? null), null),
    attempt(() => db.select().from(timeOffSyncRuns).orderBy(desc(timeOffSyncRuns.startedAt)).limit(1).then((r) => r[0] ?? null), null),
    attempt(() => db.select().from(kpiSyncRuns).orderBy(desc(kpiSyncRuns.startedAt)).limit(1).then((r) => r[0] ?? null), null),
  ]);
  const [asana, readiness, aacRun, timeOffRun, kpiRun] = [asanaQ.value, readinessQ.value, aacQ.value, timeOffQ.value, kpiQ.value];
  const checkFailed = (q: { error: string | null }) => (q.error ? `Could not check: ${q.error}` : null);

  const runOk = (r: { finishedAt: Date | null; error: string | null } | null) => (r && r.finishedAt && !r.error ? r.finishedAt : null);
  const runError = (r: { finishedAt: Date | null; error: string | null } | null) =>
    r ? (r.error ?? (r.finishedAt ? null : "Started but never finished (timed out?)")) : null;

  // The KPI run keeps going when one client/source fails: report per source.
  const report = (kpiRun?.report ?? null) as KpiSyncReport | null;
  const bySource = new Map<string, { ok: number; failed: string[] }>();
  for (const c of report?.clients ?? []) {
    const s = bySource.get(c.source) ?? { ok: 0, failed: [] };
    if (c.error) s.failed.push(`${c.code}: ${c.error}`);
    else s.ok++;
    bySource.set(c.source, s);
  }
  const kpiSources = [...bySource.entries()]
    .map(([source, s]) => ({ source, clientsOk: s.ok, failed: s.failed }))
    .sort((a, b) => a.source.localeCompare(b.source));

  const jobs: Job[] = [
    job("kpi", "KPI data (GA4, Meta, Klaviyo, Shopify)", "Daily 10:00 UTC", kpiRun?.finishedAt ?? null, checkFailed(kpiQ) ?? (kpiRun && !kpiRun.finishedAt ? "Started but never finished (timed out?)" : null),
      kpiSources.length ? `${kpiSources.reduce((a, s) => a + s.clientsOk, 0)} client sources pulled, ${kpiSources.reduce((a, s) => a + s.failed.length, 0)} failed` : null),
    job("aac", "Clients from the AAC sheet", "Daily 11:00 UTC", runOk(aacRun), checkFailed(aacQ) ?? runError(aacRun)),
    job("timeOff", "Time off (Google Calendar)", "Daily 11:30 UTC", runOk(timeOffRun), checkFailed(timeOffQ) ?? runError(timeOffRun)),
    job("asana", "Asana tasks", "Daily 12:00 UTC (with Readiness)", asana?.lastSuccessAt ?? null,
      checkFailed(asanaQ) ?? (asana?.lastError && (!asana.lastSuccessAt || (asana.lastAttemptAt && asana.lastAttemptAt > asana.lastSuccessAt)) ? asana.lastError : null),
      asana?.openCount != null ? `${asana.openCount} open tasks` : null),
    job("readiness", "Readiness snapshot", "Daily 12:00 UTC", readiness, checkFailed(readinessQ)),
  ];
  return { jobs, kpiSources };
}

// ── Keys that are set (never their values) ───────────────────────────

export function integrations() {
  const set = (k: string) => !!process.env[k];
  return [
    { label: "Google sign-in", configured: set("GOOGLE_CLIENT_ID") && set("GOOGLE_CLIENT_SECRET") },
    { label: "Asana", configured: set("ASANA_ACCESS_TOKEN") },
    { label: "Shopify app", configured: set("SHOPIFY_CLIENT_ID") && set("SHOPIFY_CLIENT_SECRET") },
    { label: "Claude (Anthropic)", configured: set("ANTHROPIC_API_KEY") },
    { label: "Email (Resend)", configured: set("RESEND_API_KEY") },
    { label: "Cron secret", configured: set("CRON_SECRET") },
    { label: "Vercel usage (API token)", configured: set("VERCEL_API_TOKEN") },
  ];
}

// ── Claude usage and recent errors ───────────────────────────────────

export async function claudeUsage() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const events = await timed(
    () =>
      db
        .select({ status: adminEventLog.status, detail: adminEventLog.detail })
        .from(adminEventLog)
        .where(and(ilike(adminEventLog.action, "claude:%"), gte(adminEventLog.createdAt, since))),
    [] as { status: string; detail: Record<string, unknown> | null }[],
  );
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  for (const e of events) {
    const usage = (e.detail?.usage ?? null) as Record<string, number> | null;
    if (!usage) continue;
    const u = {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    };
    inputTokens += u.input_tokens;
    outputTokens += u.output_tokens;
    const model = String(e.detail?.model ?? "");
    if (MODEL_RATES[model]) costUsd += computeCostUsd(model, u);
  }
  return { calls: events.length, errors: events.filter((e) => e.status === "error").length, inputTokens, outputTokens, costUsd };
}

export async function recentErrors(limit = 20) {
  return timed(
    () =>
      db
        .select({
          id: adminEventLog.id,
          section: adminEventLog.section,
          action: adminEventLog.action,
          message: adminEventLog.message,
          userEmail: adminEventLog.userEmail,
          createdAt: adminEventLog.createdAt,
        })
        .from(adminEventLog)
        .where(eq(adminEventLog.status, "error"))
        .orderBy(desc(adminEventLog.createdAt))
        .limit(limit),
    [],
  );
}
