export interface OverrideInput {
  clientIdCode: string;
  asin: string;
  sku: string;
  qty: number;
  note: string;
}

export interface OverrideRow {
  asin: string;
  sku: string;
  qty: number;
  note: string;
  setBy: string;
  setAt: string;
}

const CODE_RE = /^[A-Za-z0-9_-]+$/;

export function isClientCode(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 50 && CODE_RE.test(v);
}

const isShortString = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

export function validateOverrideBody(
  body: unknown,
): { ok: true; value: OverrideInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const b = body as Record<string, unknown>;
  if (!isClientCode(b.clientIdCode)) return { ok: false, error: "Invalid clientIdCode" };
  if (!isShortString(b.asin, 20)) return { ok: false, error: "Invalid asin" };
  if (!isShortString(b.sku, 200)) return { ok: false, error: "Invalid sku" };
  if (typeof b.qty !== "number" || !Number.isInteger(b.qty) || Math.abs(b.qty) > 1_000_000) {
    return { ok: false, error: "qty must be an integer within ±1,000,000" };
  }
  if (typeof b.note !== "string" || b.note.length > 1000) {
    return { ok: false, error: "note must be a string of at most 1,000 characters" };
  }
  return { ok: true, value: { clientIdCode: b.clientIdCode, asin: b.asin, sku: b.sku, qty: b.qty, note: b.note.trim() } };
}
