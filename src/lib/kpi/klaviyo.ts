import { klaviyoProvider, readSecret } from "./secrets";
import type { DailyValue } from "./ga4";

/**
 * Klaviyo for the Main KPIs: each client's read-only private API key
 * (metrics:read) is pasted on its profile. Daily figures come from the
 * metric aggregates endpoint, grouped by when events happened — close to,
 * not identical with, Klaviyo's dashboard attribution.
 */

const REVISION = () => process.env.KLAVIYO_REVISION || "2025-07-15";
const BASE = "https://a.klaviyo.com/api";

async function call(key: string, path: string, init?: RequestInit, attempt = 0): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: REVISION(),
      accept: "application/vnd.api+json",
      "content-type": "application/vnd.api+json",
    },
  });
  // Klaviyo rate-limits bursts: wait what it asks (Retry-After) and try again, a few times.
  if (res.status === 429 && attempt < 4) {
    const wait = Math.min(Number(res.headers.get("retry-after")) || 2, 30);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return call(key, path, init, attempt + 1);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const first = ((json.errors ?? []) as { detail?: string }[])[0];
    throw new Error(`Klaviyo: ${first?.detail ?? `HTTP ${res.status}`}`);
  }
  return json;
}

type MetricRow = { id: string; attributes: { name: string; integration?: { name?: string } | null } };

/** The account's metrics (name → id), e.g. "Placed Order", "Subscribed to Email Marketing". */
export async function listKlaviyoMetrics(key: string): Promise<{ id: string; name: string; integration: string | null }[]> {
  const out: { id: string; name: string; integration: string | null }[] = [];
  let path: string | null = "/metrics/";
  while (path) {
    const json = await call(key, path);
    for (const m of (json.data ?? []) as MetricRow[]) out.push({ id: m.id, name: m.attributes.name, integration: m.attributes.integration?.name ?? null });
    const next = ((json.links ?? {}) as { next?: string | null }).next;
    path = next ? next.replace(BASE, "") : null;
  }
  return out;
}

/** Validates a key before it's saved; returns how many metrics it can see. */
export async function checkKlaviyoKey(key: string): Promise<number> {
  return (await listKlaviyoMetrics(key)).length;
}

type AggregateResponse = { data?: { attributes?: { dates?: string[]; data?: { dimensions?: string[]; measurements?: Record<string, number[]> }[] } } };

/** Pure: a metric-aggregates response → per-day totals of one measurement (optionally only some dimension values). */
export function sumAggregate(json: AggregateResponse, measurement: string, keepDimension?: (d: string) => boolean): Map<string, number> {
  const attrs = json.data?.attributes ?? {};
  const dates = (attrs.dates ?? []).map((d) => d.slice(0, 10));
  const out = new Map<string, number>();
  for (const series of attrs.data ?? []) {
    const dim = series.dimensions?.[0] ?? "";
    if (keepDimension && !keepDimension(dim)) continue;
    (series.measurements?.[measurement] ?? []).forEach((v, i) => {
      if (dates[i]) out.set(dates[i], (out.get(dates[i]) ?? 0) + (Number(v) || 0));
    });
  }
  return out;
}

async function aggregate(key: string, metricId: string, from: string, to: string, measurements: string[], by?: string[]) {
  // Klaviyo caps a query at one year; callers keep ranges inside that.
  return (await call(key, "/metric-aggregates/", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "metric-aggregate",
        attributes: {
          metric_id: metricId,
          measurements,
          interval: "day",
          timezone: "America/Chicago",
          filter: [`greater-or-equal(datetime,${from}T00:00:00)`, `less-than(datetime,${addDay(to)}T00:00:00)`],
          ...(by ? { by } : {}),
        },
      },
    }),
  })) as AggregateResponse;
}

const addDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const ATTRIBUTED = (dim: string) => /email|sms/i.test(dim);

/**
 * Daily: revenue and orders attributed to Klaviyo (email + SMS), total store
 * orders revenue as Klaviyo sees it, new subscribers, unsubscribes and net.
 */
export async function fetchKlaviyoDaily(clientIdCode: string, from: string, to: string): Promise<DailyValue[]> {
  const key = await readSecret(klaviyoProvider(clientIdCode));
  if (!key) throw new Error("No Klaviyo key");
  const metrics = await listKlaviyoMetrics(key);
  const find = (...names: string[]) => names.map((n) => metrics.find((m) => m.name.toLowerCase() === n.toLowerCase())).find(Boolean);
  const placed = find("Placed Order");
  const subscribed = find("Subscribed to Email Marketing", "Subscribed to List");
  const unsubscribed = find("Unsubscribed from Email Marketing", "Unsubscribed");

  const out: DailyValue[] = [];
  const push = (metric: string, map: Map<string, number>) => map.forEach((value, day) => out.push({ day, metric, value }));

  if (placed) {
    const byChannel = await aggregate(key, placed.id, from, to, ["sum_value", "count"], ["$attributed_channel"]);
    push("attributed_revenue", sumAggregate(byChannel, "sum_value", ATTRIBUTED));
    push("attributed_orders", sumAggregate(byChannel, "count", ATTRIBUTED));
    push("store_revenue", sumAggregate(byChannel, "sum_value"));
  }
  const subs = subscribed ? sumAggregate(await aggregate(key, subscribed.id, from, to, ["count"]), "count") : new Map<string, number>();
  const unsubs = unsubscribed ? sumAggregate(await aggregate(key, unsubscribed.id, from, to, ["count"]), "count") : new Map<string, number>();
  push("new_subscribers", subs);
  push("unsubscribes", unsubs);
  const days = new Set([...subs.keys(), ...unsubs.keys()]);
  days.forEach((day) => out.push({ day, metric: "net_subscribers", value: (subs.get(day) ?? 0) - (unsubs.get(day) ?? 0) }));
  return out;
}
