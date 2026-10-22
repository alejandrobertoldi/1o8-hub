import { validateRecSettings, type RecSettings } from "./rec-settings";
import { isClientCode } from "./overrides";

// 16 bind params per row (15 fields + snapshot_id); 4,096 rows would overflow
// Postgres's 65,535-parameter limit in the single multi-row insert.
export const MAX_SNAPSHOT_ROWS = 4000;

export interface SnapshotRowInput {
  asin: string;
  sku: string;
  productName: string;
  mainImageUrl: string;
  available: number;
  inbound: number;
  reserved: number;
  /** AWD stock at send (0130); older rows and older clients send 0. */
  awdAvailable: number;
  awdInbound: number;
  stockPosition: number;
  basisUnits: number;
  liveCalc: number;
  overrideQty: number | null;
  note: string;
  final: number;
}

// What a client may see of a sent row. No overrideQty / note, and no liveCalc:
// liveCalc next to final would reveal that (and by how much) a row was overridden.
export type PortalSnapshotRow = Omit<SnapshotRowInput, "overrideQty" | "note" | "liveCalc">;

export interface SnapshotTotals {
  skuCount: number;
  unitsToSend: number;
  overstockSkus: number;
  overstockUnits: number;
}

export interface SnapshotHeader extends SnapshotTotals, RecSettings {
  id: string;
  clientIdCode: string;
  sentBy: string;
  sentAt: string;
}

export function summarizeRows(rows: Pick<SnapshotRowInput, "final">[]): SnapshotTotals {
  let unitsToSend = 0, overstockSkus = 0, overstockUnits = 0;
  for (const r of rows) {
    if (r.final > 0) unitsToSend += r.final;
    if (r.final < 0) { overstockSkus += 1; overstockUnits += -r.final; }
  }
  return { skuCount: rows.length, unitsToSend, overstockSkus, overstockUnits };
}

const INT_FIELDS = ["available", "inbound", "reserved", "stockPosition", "basisUnits", "liveCalc", "final"] as const;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && Math.abs(v) <= 100_000_000;
const isStr = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

function validRow(r: unknown): r is SnapshotRowInput {
  if (!r || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  return (
    isStr(o.asin, 20) && o.asin.length > 0 &&
    isStr(o.sku, 200) && o.sku.length > 0 &&
    isStr(o.productName, 1000) && isStr(o.mainImageUrl, 2000) && isStr(o.note, 1000) &&
    INT_FIELDS.every((k) => isInt(o[k])) &&
    (o.awdAvailable === undefined || isInt(o.awdAvailable)) &&
    (o.awdInbound === undefined || isInt(o.awdInbound)) &&
    (o.overrideQty === null || isInt(o.overrideQty))
  );
}

export function validateSnapshotBody(
  body: unknown,
): { ok: true; value: { clientIdCode: string; settings: RecSettings; rows: SnapshotRowInput[] } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!isClientCode(b.clientIdCode)) return { ok: false, error: "Invalid clientIdCode" };
  const s = validateRecSettings(b.settings);
  if (!s.ok) return { ok: false, error: s.error };
  if (!Array.isArray(b.rows) || b.rows.length === 0) return { ok: false, error: "A snapshot needs at least one row" };
  if (b.rows.length > MAX_SNAPSHOT_ROWS) return { ok: false, error: `At most ${MAX_SNAPSHOT_ROWS} rows` };
  if (!b.rows.every(validRow)) return { ok: false, error: "Invalid snapshot row" };
  const normalizedRows = b.rows.map((row) => {
    const r = row as SnapshotRowInput;
    return {
      asin: r.asin,
      sku: r.sku,
      productName: r.productName,
      mainImageUrl: r.mainImageUrl,
      available: r.available,
      inbound: r.inbound,
      reserved: r.reserved,
      awdAvailable: r.awdAvailable ?? 0,
      awdInbound: r.awdInbound ?? 0,
      stockPosition: r.stockPosition,
      basisUnits: r.basisUnits,
      liveCalc: r.liveCalc,
      overrideQty: r.overrideQty,
      note: r.note,
      final: r.final,
    };
  });
  return { ok: true, value: { clientIdCode: b.clientIdCode as string, settings: s.value, rows: normalizedRows } };
}

export function toPortalRow(row: SnapshotRowInput): PortalSnapshotRow {
  return {
    asin: row.asin,
    sku: row.sku,
    productName: row.productName,
    mainImageUrl: row.mainImageUrl,
    available: row.available,
    inbound: row.inbound,
    reserved: row.reserved,
    awdAvailable: row.awdAvailable ?? 0,
    awdInbound: row.awdInbound ?? 0,
    stockPosition: row.stockPosition,
    basisUnits: row.basisUnits,
    final: row.final,
  };
}
