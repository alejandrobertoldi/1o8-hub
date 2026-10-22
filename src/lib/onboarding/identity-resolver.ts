// src/lib/onboarding/identity-resolver.ts
/**
 * Pure routing for NTA listing-intake Sheet rows:
 *   ASIN match → UPDATE
 *   SKU match within client → UPDATE (set backfillAsin if row brings a new ASIN)
 *   No match + SKU present → INSERT
 *   No SKU → REJECT
 * Caller is responsible for fetching the candidate set already scoped by clientIdCode.
 */

export interface SheetRow {
  sku: string;
  asin: string;
}

export interface MasterCandidate {
  id: string;
  sku: string | null;
  asin: string | null;
}

export type Resolution =
  | { action: "update"; productId: string; backfillAsin: boolean }
  | { action: "insert" }
  | { action: "reject"; reason: "missing-sku" };

export function resolveRowIdentity(
  row: SheetRow,
  candidates: MasterCandidate[],
): Resolution {
  const sku = row.sku.trim();
  const asin = row.asin.trim();

  if (asin) {
    const hit = candidates.find((c) => c.asin === asin);
    if (hit) return { action: "update", productId: hit.id, backfillAsin: false };
  }

  if (sku) {
    const hit = candidates.find((c) => c.sku === sku);
    if (hit) {
      const backfillAsin = !!asin && hit.asin !== asin;
      return { action: "update", productId: hit.id, backfillAsin };
    }
    return { action: "insert" };
  }

  return { action: "reject", reason: "missing-sku" };
}
