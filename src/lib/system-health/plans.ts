/**
 * Plan limits the 1o8 Hub runs on, and helpers to compare usage against them.
 * Pure: shared by the System Health API and its tests.
 *
 * Sources (checked 2026-11-03):
 *  - Vercel Hobby monthly allotments: vercel.com/docs/limits/fair-use-guidelines
 *    (Hobby is paused when an allotment runs out, until the next cycle).
 *  - Supabase Free: 500 MB database per project (supabase.com/pricing).
 */

export const SUPABASE_PLAN = { name: "Supabase Free", databaseBytes: 500 * 1024 * 1024 };

export type UnitKind = "gb" | "hours" | "gbHours" | "count";

/** Vercel Hobby allotments per month. `match` finds the charge lines by ServiceName. */
export const VERCEL_HOBBY = [
  { key: "fastDataTransfer", label: "Fast Data Transfer", match: /fast data transfer/i, limit: 100, kind: "gb" as UnitKind },
  { key: "fastOriginTransfer", label: "Fast Origin Transfer", match: /fast origin transfer/i, limit: 10, kind: "gb" as UnitKind },
  { key: "functionInvocations", label: "Function Invocations", match: /function invocations?/i, limit: 1_000_000, kind: "count" as UnitKind },
  { key: "activeCpu", label: "Active CPU", match: /active cpu/i, limit: 4, kind: "hours" as UnitKind },
  { key: "provisionedMemory", label: "Provisioned Memory", match: /provisioned memory/i, limit: 360, kind: "gbHours" as UnitKind },
  { key: "imageTransformations", label: "Image Optimization Transformations", match: /image optimi[sz]ation transformations?/i, limit: 5_000, kind: "count" as UnitKind },
] as const;

/** Usage level: under 70% fine, 70–90% watch, 90%+ act now. */
export type Level = "ok" | "watch" | "critical" | "unknown";
export function usageLevel(used: number | null, limit: number): Level {
  if (used == null || !Number.isFinite(used) || limit <= 0) return "unknown";
  const pct = used / limit;
  return pct >= 0.9 ? "critical" : pct >= 0.7 ? "watch" : "ok";
}

const BYTES: Record<string, number> = { b: 1, byte: 1, bytes: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12 };
const SECONDS: Record<string, number> = { ms: 1e-3, millisecond: 1e-3, milliseconds: 1e-3, s: 1, sec: 1, second: 1, seconds: 1, min: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600 };

/**
 * Converts a Vercel charge quantity to the unit of its allotment (GB, hours,
 * GB-hours or a plain count). Returns null when the unit can't be read, so the
 * page shows the raw figure instead of a wrong percentage.
 */
export function toAllotmentUnit(quantity: number, unit: string | null | undefined, kind: UnitKind): number | null {
  const u = (unit ?? "").trim().toLowerCase();
  if (kind === "count") return quantity;
  if (kind === "gb") {
    const f = BYTES[u];
    return f ? (quantity * f) / 1e9 : null;
  }
  if (kind === "hours") {
    const f = SECONDS[u];
    return f ? (quantity * f) / 3600 : null;
  }
  // GB-hours: "GB-Hrs", "GB-Hours", "GB-Seconds", "MB-Seconds"…
  const m = u.match(/^(b|kb|mb|gb|tb)[\s-]*(ms|s|sec|seconds?|min|minutes?|h|hrs?|hours?)$/);
  if (!m) return null;
  return (quantity * BYTES[m[1]] * SECONDS[m[2]]) / 1e9 / 3600;
}

export type VercelCharge = {
  ServiceName?: string;
  ConsumedQuantity?: number | string | null;
  ConsumedUnit?: string | null;
  BilledCost?: number | string | null;
  ChargeCategory?: string;
};

export type VercelMetric = {
  key: string;
  label: string;
  used: number | null;
  limit: number;
  kind: UnitKind;
  level: Level;
  /** What Vercel reported, when it couldn't be converted to the allotment unit. */
  raw: string | null;
};

/** Sums the month's charge lines into the Hobby allotments; anything else is listed apart. */
export function summarizeVercelCharges(charges: VercelCharge[]) {
  const metrics: VercelMetric[] = VERCEL_HOBBY.map((a) => ({ key: a.key, label: a.label, used: 0, limit: a.limit, kind: a.kind, level: "ok", raw: null }));
  const other = new Map<string, { quantity: number; unit: string | null }>();
  let billed = 0;

  for (const c of charges) {
    const name = c.ServiceName ?? "";
    const qty = Number(c.ConsumedQuantity ?? 0);
    billed += Number(c.BilledCost ?? 0) || 0;
    if (!name || !Number.isFinite(qty)) continue;
    const idx = VERCEL_HOBBY.findIndex((a) => a.match.test(name));
    if (idx === -1) {
      const o = other.get(name) ?? { quantity: 0, unit: c.ConsumedUnit ?? null };
      o.quantity += qty;
      other.set(name, o);
      continue;
    }
    const m = metrics[idx];
    const converted = toAllotmentUnit(qty, c.ConsumedUnit, m.kind);
    if (converted == null) {
      m.used = null;
      m.raw = `${qty.toLocaleString("en-US")} ${c.ConsumedUnit ?? ""}`.trim();
    } else if (m.used != null) {
      m.used += converted;
    }
  }
  for (const m of metrics) m.level = usageLevel(m.used, m.limit);
  return {
    metrics,
    other: [...other.entries()].map(([name, o]) => ({ name, quantity: o.quantity, unit: o.unit })),
    billedUsd: billed,
  };
}

/** Parses Vercel's JSONL charge stream; bad lines are skipped. */
export function parseJsonl(text: string): VercelCharge[] {
  const out: VercelCharge[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // skip
    }
  }
  return out;
}
