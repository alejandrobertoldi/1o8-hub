// Per-product safety buffer on the recommendation basis: Final = Basis × (1 + buffer%)
// − stock. Stored per client + SKU; a product without a row uses DEFAULT_BUFFER_PCT.
import { isClientCode } from "./overrides";

export const DEFAULT_BUFFER_PCT = 0; // 2026-10-08: no buffer unless set per product (was a fixed 10%)
export const MAX_BUFFER_PCT = 200;

export interface BufferRow {
  sku: string;
  bufferPct: number;
  setBy: string;
  setAt: string;
}

export function validateBufferBody(
  body: unknown,
): { ok: true; value: { clientIdCode: string; sku: string; bufferPct: number } } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!isClientCode(b.clientIdCode)) return { ok: false, error: "Invalid clientIdCode" };
  if (typeof b.sku !== "string" || !b.sku.trim() || b.sku.length > 200) return { ok: false, error: "Invalid sku" };
  if (typeof b.bufferPct !== "number" || !Number.isInteger(b.bufferPct) || b.bufferPct < 0 || b.bufferPct > MAX_BUFFER_PCT) {
    return { ok: false, error: `bufferPct must be an integer 0–${MAX_BUFFER_PCT}` };
  }
  return { ok: true, value: { clientIdCode: b.clientIdCode, sku: b.sku, bufferPct: b.bufferPct } };
}
