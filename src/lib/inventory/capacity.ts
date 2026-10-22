// FBA capacity usage, the way Seller Central's Capacity Monitor counts it, from
// the Restock Inventory report: units × unit_storage_size (ft³), per storage type.
// Verified 2026-10-09 on Halfday: 0.2589 ft³/unit average, same as Amazon's.
// Limits are not in Redshift and are managed in Seller Central only.

export type StorageType = "Standard-size" | "Oversize" | "Flammable" | "Aerosol";

export interface CapacityRow {
  sku: string;
  asin: string;
  unitStorageSize: string | null; // e.g. "0.2527 ft3"
  available: number;
  fcTransfer: number;
  fcProcessing: number;
  customerOrder: number;
  unfulfillable: number;
  working: number;
  shipped: number;
  receiving: number;
}

export interface CapacityTypeTotals {
  type: StorageType;
  onhandUnits: number;
  onhandFt3: number;
  openUnits: number;
  openFt3: number;
}

export interface CapacityResponse {
  asOf: string | null;
  types: CapacityTypeTotals[];
  /** Per SKU: volume of one unit and its storage type, to size a recommendation. */
  skus: Record<string, { ft3PerUnit: number; type: StorageType }>;
}

export function parseFt3(s: string | null | undefined): number {
  const m = /([0-9]*\.?[0-9]+)/.exec(s ?? "");
  return m ? Number(m[1]) : 0;
}

/** Amazon storage type from the storage-fees report's size tier + dangerous-goods type. */
export function storageTypeOf(sizeTier: string | null | undefined, dangerousGoods: string | null | undefined): StorageType {
  const dg = (dangerousGoods ?? "").toUpperCase();
  if (dg.includes("FLAMMABLE")) return "Flammable";
  if (dg.includes("AEROSOL")) return "Aerosol";
  if ((sizeTier ?? "").toLowerCase().startsWith("oversize")) return "Oversize";
  return "Standard-size";
}

const ORDER: StorageType[] = ["Standard-size", "Oversize", "Flammable", "Aerosol"];

/**
 * On-hand = available + FC transfer + FC processing + customer orders + unfulfillable
 * (Amazon: inventory at fulfilment centres, excluding pending removal).
 * Open shipments = working + shipped + receiving. Only types with stock are returned.
 */
export function summarizeCapacity(rows: CapacityRow[], typeOfAsin: (asin: string) => StorageType): Omit<CapacityResponse, "asOf"> {
  const totals = new Map<StorageType, CapacityTypeTotals>();
  const skus: CapacityResponse["skus"] = {};
  for (const r of rows) {
    const ft3 = parseFt3(r.unitStorageSize);
    const type = typeOfAsin(r.asin);
    skus[r.sku] = { ft3PerUnit: ft3, type };
    const onhand = r.available + r.fcTransfer + r.fcProcessing + r.customerOrder + r.unfulfillable;
    const open = r.working + r.shipped + r.receiving;
    const t = totals.get(type) ?? { type, onhandUnits: 0, onhandFt3: 0, openUnits: 0, openFt3: 0 };
    t.onhandUnits += onhand;
    t.onhandFt3 += onhand * ft3;
    t.openUnits += open;
    t.openFt3 += open * ft3;
    totals.set(type, t);
  }
  const types = [...totals.values()]
    .filter((t) => t.onhandUnits + t.openUnits > 0)
    .map((t) => ({ ...t, onhandFt3: round2(t.onhandFt3), openFt3: round2(t.openFt3) }))
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));
  return { types, skus };
}

/** Volume a set of shipments would add, per storage type (positive quantities only). */
export function addedByType(sends: { sku: string; qty: number }[], skus: CapacityResponse["skus"]): Map<StorageType, { units: number; ft3: number }> {
  const out = new Map<StorageType, { units: number; ft3: number }>();
  for (const s of sends) {
    if (s.qty <= 0) continue;
    const info = skus[s.sku];
    if (!info) continue;
    const t = out.get(info.type) ?? { units: 0, ft3: 0 };
    t.units += s.qty;
    t.ft3 += s.qty * info.ft3PerUnit;
    out.set(info.type, t);
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Limits (typed in from Seller Central → Capacity Monitor) ───────────────

export const STORAGE_TYPES: readonly StorageType[] = ["Standard-size", "Oversize", "Flammable", "Aerosol"];

export type LimitStatus = "confirmed" | "estimate";

export interface CapacityLimitRow {
  storageType: StorageType;
  month: string; // YYYY-MM
  limitFt3: number;
  /** Set by the team from Capacity Monitor — never derived from the date. */
  status: LimitStatus;
  setBy: string;
  setAt: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** This month and the next two, YYYY-MM — Capacity Monitor's outlook window. */
export function outlookMonths(todayIso: string): string[] {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7)) - 1;
  return [0, 1, 2].map((k) => {
    const d = new Date(Date.UTC(y, m + k, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** PUT body: limitFt3 null deletes the month's limit. */
export function validateLimitBody(
  body: unknown,
): { ok: true; value: { clientIdCode: string; storageType: StorageType; month: string; limitFt3: number | null; status?: LimitStatus } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (typeof b.clientIdCode !== "string" || !/^[A-Za-z0-9_-]{1,50}$/.test(b.clientIdCode)) return { ok: false, error: "Invalid clientIdCode" };
  if (!STORAGE_TYPES.includes(b.storageType as StorageType)) return { ok: false, error: "Invalid storageType" };
  if (typeof b.month !== "string" || !MONTH_RE.test(b.month)) return { ok: false, error: "month must be YYYY-MM" };
  if (b.limitFt3 !== null && (typeof b.limitFt3 !== "number" || !Number.isFinite(b.limitFt3) || b.limitFt3 < 0 || b.limitFt3 > 100_000_000)) {
    return { ok: false, error: "limitFt3 must be a number 0–100,000,000 or null" };
  }
  if (b.status !== undefined && b.status !== "confirmed" && b.status !== "estimate") return { ok: false, error: "status must be confirmed or estimate" };
  return {
    ok: true,
    value: { clientIdCode: b.clientIdCode, storageType: b.storageType as StorageType, month: b.month, limitFt3: b.limitFt3 as number | null, status: b.status as LimitStatus | undefined },
  };
}

/**
 * Reads a typed limit in either number format: "6,706.57" (US) or "6.706,57" /
 * "6706,57" (EU numpad, where the decimal key types a comma). The last
 * separator is the decimal point when 1–2 digits follow it; a separator
 * followed by exactly 3 digits is a thousands group. Returns null if unreadable.
 */
export function parseLimitInput(raw: string): number | null {
  // Keyboard-agnostic: Arabic-Indic / Persian digits → 0-9; spaces (incl. the
  // narrow no-break space) and Swiss apostrophes are thousands separators.
  const t = raw
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s'’]/g, "");
  if (!t || !/^[0-9.,]+$/.test(t)) return null;
  const last = Math.max(t.lastIndexOf(","), t.lastIndexOf("."));
  let intPart = t;
  let decPart = "";
  if (last >= 0 && t.length - last - 1 <= 2) {
    intPart = t.slice(0, last);
    decPart = t.slice(last + 1);
  }
  const digits = intPart.replace(/[.,]/g, "");
  if (!digits && !decPart) return null;
  const n = Number(`${digits || "0"}.${decPart || "0"}`);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

