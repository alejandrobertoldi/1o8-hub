/* Shared warm logic for the sales-summary cache crons.
 *
 * Split across two crons because a single sequential sweep (summary → inventory
 * → daily → sns) blows past Vercel's 300s maxDuration inside the inventory step,
 * leaving daily/sns perpetually stale → cache miss → live Redshift → stuck
 * Product Details spinner. Inventory now runs in its own cron with its own budget.
 */
import { recentWeekRanges, type WeekRange } from "@/lib/iso-week";
import { mapWithConcurrency } from "@/lib/concurrency";
import { buildInventoryCacheKey, getCacheUpdatedAt } from "@/lib/sales-cache";

// Each warmed client is its own serverless invocation with its own Redshift pool
// (max:5). Cap fan-out so total concurrent Redshift connections (~CONCURRENCY*5)
// stays under Intentwise's limits. Lower this first if Redshift rejects connections.
export const WARM_CONCURRENCY = 4;

export type ClientInfo = { clientIdCode: string; accountIds: string[] };
export type WeekMeta = {
  start: string; end: string;
  prevStart: string; prevEnd: string;
  yoyStart: string; yoyEnd: string;
  mtdStart: string; mtdEnd: string;
  ytdStart: string; ytdEnd: string;
};
export type StepResult = { step: string; status: string; detail?: string };

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}

/**
 * Step 1 (shared): refresh the summary for the 3 most-recent ISO weeks and
 * collect the union of clients + per-week sub-period dates. Both crons call this
 * first — summary is cache-first for settled weeks, so the duplicate call is cheap.
 */
export async function gatherClients(
  baseUrl: string,
  cronHeaders: Record<string, string>,
): Promise<{ allClients: ClientInfo[]; weekMetas: WeekMeta[]; weeks: WeekRange[]; results: StepResult[] }> {
  const now = new Date();
  const weeks = recentWeekRanges(now, 3);
  const results: StepResult[] = [];
  const clientMap = new Map<string, ClientInfo>();
  const weekMetas: WeekMeta[] = [];

  for (const week of weeks) {
    try {
      const isCurrent = week.start === weeks[0].start;
      const url = `${baseUrl}/api/sales-summary?period=7D&start=${week.start}&end=${week.end}${isCurrent ? "&refresh=true" : ""}`;
      const res = await fetch(url, { headers: cronHeaders });
      if (!res.ok) {
        results.push({ step: `summary ${week.start}`, status: "error", detail: `HTTP ${res.status}` });
        continue;
      }
      const data = await res.json();
      const clients = (data.clients || []) as ClientInfo[];
      results.push({ step: `summary ${week.start}`, status: "ok", detail: `${clients.length} clients` });
      weekMetas.push({
        start: data.start || week.start,
        end: data.end || week.end,
        prevStart: data.prevStart || "",
        prevEnd: data.prevEnd || "",
        yoyStart: data.yoyStart || "",
        yoyEnd: data.yoyEnd || "",
        mtdStart: data.mtdStart || "",
        mtdEnd: data.mtdEnd || "",
        ytdStart: data.ytdStart || "",
        ytdEnd: data.ytdEnd || "",
      });
      for (const c of clients) {
        if (c.clientIdCode && !clientMap.has(c.clientIdCode)) clientMap.set(c.clientIdCode, c);
      }
    } catch (err) {
      results.push({ step: `summary ${week.start}`, status: "error", detail: errMsg(err) });
    }
  }

  const allClients = [...clientMap.values()];
  results.push({ step: "clients", status: "ok", detail: `${allClients.length} unique` });
  return { allClients, weekMetas, weeks, results };
}

/**
 * Stop STARTING new inventory calls after this long. The cron has 300s and one
 * inventory call can run its full 120s maxDuration, so anything started later would
 * be killed with the function. Clients not reached are picked up first next run.
 */
export const INVENTORY_WARM_BUDGET_MS = 170_000;

/** Never-cached first, then oldest cache first. Returns a new array. */
export function orderStalestFirst<T>(items: T[], updatedAt: (item: T) => Date | undefined): T[] {
  const ts = (item: T) => updatedAt(item)?.getTime() ?? -Infinity;
  return items.slice().sort((a, b) => ts(a) - ts(b));
}

/** Warm product inventory per client for the current + previous week. */
export async function warmInventory(
  baseUrl: string,
  cronHeaders: Record<string, string>,
  allClients: ClientInfo[],
  weekMetas: WeekMeta[],
): Promise<StepResult> {
  if (allClients.length === 0 || weekMetas.length === 0) {
    return { step: "inventory", status: "skipped", detail: "no clients/weeks" };
  }
  const inventoryWeeks = weekMetas.slice(0, 2);
  const startedAt = Date.now();
  let ok = 0, err = 0, skipped = 0;
  for (let w = 0; w < inventoryWeeks.length; w++) {
    const wm = inventoryWeeks[w];
    const isCurrentWeek = w === 0; // only the in-progress week forces a Redshift refresh
    // Stalest first: a run that hits its budget must not starve the same clients
    // every time (2026-10-01: 8 of 16 had gone 30-69h without a refresh).
    const keyOf = (c: ClientInfo) => buildInventoryCacheKey(wm.start, wm.end, c.accountIds.join(","));
    let ordered = allClients;
    try {
      const ages = await getCacheUpdatedAt("inventory", allClients.map(keyOf));
      ordered = orderStalestFirst(allClients, (c) => ages.get(keyOf(c)));
    } catch {
      // Ordering is an optimisation — warm in the default order if the lookup fails.
    }
    const outcomes = await mapWithConcurrency(ordered, WARM_CONCURRENCY, async (client) => {
      if (Date.now() - startedAt > INVENTORY_WARM_BUDGET_MS) return "skipped" as const;
      const params = new URLSearchParams({
        start: wm.start, end: wm.end, accountIds: client.accountIds.join(","),
        prevStart: wm.prevStart, prevEnd: wm.prevEnd,
        yoyStart: wm.yoyStart, yoyEnd: wm.yoyEnd,
        mtdStart: wm.mtdStart, mtdEnd: wm.mtdEnd,
        ytdStart: wm.ytdStart, ytdEnd: wm.ytdEnd,
      });
      if (isCurrentWeek) params.set("refresh", "true");
      const res = await fetch(`${baseUrl}/api/sales-summary/inventory?${params}`, { headers: cronHeaders });
      return res.ok;
    });
    for (const o of outcomes) {
      if (o === "skipped") skipped++;
      else if (o) ok++;
      else err++;
    }
  }
  return {
    step: "inventory",
    status: err === 0 && skipped === 0 ? "ok" : "partial",
    detail: `${ok} ok, ${err} errors, ${skipped} skipped for time (${inventoryWeeks.length} weeks)`,
  };
}

/** Warm daily sparkline (current + prev week) and SNS timeline per client. */
export async function warmDailyAndSns(
  baseUrl: string,
  cronHeaders: Record<string, string>,
  allClients: ClientInfo[],
  weeks: WeekRange[],
): Promise<StepResult[]> {
  const results: StepResult[] = [];
  if (allClients.length === 0) return results;

  const dailyWeeks = weeks.slice(0, 2);
  let dailyOk = 0, dailyErr = 0;
  for (let w = 0; w < dailyWeeks.length; w++) {
    const week = dailyWeeks[w];
    const isCurrentWeek = w === 0;
    const outcomes = await mapWithConcurrency(allClients, WARM_CONCURRENCY, async (client) => {
      const params = new URLSearchParams({ start: week.start, end: week.end, accountIds: client.accountIds.join(",") });
      if (isCurrentWeek) params.set("refresh", "true");
      const res = await fetch(`${baseUrl}/api/sales-summary/daily?${params}`, { headers: cronHeaders });
      return res.ok;
    });
    for (const o of outcomes) o ? dailyOk++ : dailyErr++;
  }
  results.push({ step: "daily", status: dailyErr === 0 ? "ok" : "partial", detail: `${dailyOk} ok, ${dailyErr} errors` });

  const snsOutcomes = await mapWithConcurrency(allClients, WARM_CONCURRENCY, async (client) => {
    const params = new URLSearchParams({ accountIds: client.accountIds.join(","), refresh: "true" });
    const res = await fetch(`${baseUrl}/api/sales-summary/sns?${params}`, { headers: cronHeaders });
    return res.ok;
  });
  let snsOk = 0, snsErr = 0;
  for (const o of snsOutcomes) o ? snsOk++ : snsErr++;
  results.push({ step: "sns", status: snsErr === 0 ? "ok" : "partial", detail: `${snsOk} ok, ${snsErr} errors` });

  return results;
}

export function resolveBaseUrl(): string {
  return process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
}

export function cronAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CRON_SECRET}`, "x-cron-refresh": "true" };
}
