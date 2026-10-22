/**
 * Read-side helpers for the three per-productType fields on attributes_master:
 *   Attributes_Requirement (scalar)
 *   Attributes_Description (scalar)
 *   Attributes_ValidValues  (array)
 *
 * Storage on canonical may be:
 *   - JSON object keyed by productType: {"SAUCE":"Required","BABY_PRODUCT":"Optional"}
 *   - JSON object with an "ALL" universal key: {"ALL":"Required"}
 *   - Legacy plain text (e.g. "Required") — read as universal
 *
 * Plan: docs/superpowers/plans/2026-05-27-attributes-per-category-storage.md (Phase 1.1)
 */

function tryParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function canonicalScalarForProductType(
  raw: string | null,
  productType: string,
): string | null {
  if (!raw) return null;
  const obj = tryParseObject(raw);
  if (!obj) {
    return raw;
  }
  const v = productType in obj ? obj[productType] : obj.ALL;
  return typeof v === "string" ? v : null;
}

export function canonicalArrayForProductType(
  raw: string | null,
  productType: string,
): string[] | null {
  if (!raw) return null;
  const obj = tryParseObject(raw);
  if (!obj) return null;
  const v = productType in obj ? obj[productType] : obj.ALL;
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === "string") ? (v as string[]) : null;
}

export const canonicalValidValuesForProductType = canonicalArrayForProductType;

export function canonicalScalarMap(
  raw: string | null,
): Record<string, string> | null {
  if (!raw) return null;
  const obj = tryParseObject(raw);
  if (!obj) return { ALL: raw };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function canonicalArrayMap(
  raw: string | null,
): Record<string, string[]> | null {
  if (!raw) return null;
  const obj = tryParseObject(raw);
  if (!obj) return null;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v as string[];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * True when the canonical column is JSON and `productType` is an explicit
 * top-level key. Plain text (legacy) or null returns false — those are
 * treated as universal fallbacks, not as explicit productType entries.
 *
 * Phase 2 write-side uses this to decide between first-wins WRITE (no
 * explicit entry yet) vs DIVERGENCE (entry exists and client value differs).
 */
export function isProductTypeExplicitlyKeyed(
  raw: string | null,
  productType: string,
): boolean {
  if (!raw) return false;
  const obj = tryParseObject(raw);
  if (!obj) return false;
  return productType in obj;
}

/**
 * Add (or overwrite) a productType key on a scalar canonical column.
 *  - null              → '{"PT":value}'
 *  - JSON object       → JSON with PT merged into existing keys
 *  - legacy plain text → '{"ALL":<legacy>,"PT":value}' (promotes legacy to ALL)
 */
export function mergeCanonicalScalar(
  raw: string | null,
  productType: string,
  value: string,
): string {
  if (!raw) return JSON.stringify({ [productType]: value });
  const obj = tryParseObject(raw);
  if (!obj) return JSON.stringify({ ALL: raw, [productType]: value });
  return JSON.stringify({ ...obj, [productType]: value });
}

/**
 * Array-valued counterpart of mergeCanonicalScalar. Plain text is not a real
 * legacy shape for validValues (column was always JSON or NULL) but we keep
 * the same promotion behavior for safety.
 */
export function mergeCanonicalArray(
  raw: string | null,
  productType: string,
  value: string[],
): string {
  if (!raw) return JSON.stringify({ [productType]: value });
  const obj = tryParseObject(raw);
  if (!obj) return JSON.stringify({ ALL: raw, [productType]: value });
  return JSON.stringify({ ...obj, [productType]: value });
}
