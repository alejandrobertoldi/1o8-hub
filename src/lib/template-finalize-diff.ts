// ═══════════════════════════════════════════════════════════════
// template-finalize-diff.ts
// Pure three-way diff between seeded snapshot, current sheet values,
// and current catalog values. Used by /finalize and /diff endpoints.
// ═══════════════════════════════════════════════════════════════

export type DiffBucket = "unchanged" | "clientEdited" | "catalogDrifted" | "conflict";

export interface DiffInput {
  /** asin → field → value at seed time */
  seeded: Record<string, Record<string, string | null>>;
  /** asin → field → value currently in the sheet */
  sheetNow: Record<string, Record<string, string | null>>;
  /** asin → field → value currently in the catalog */
  catalogNow: Record<string, Record<string, string | null>>;
}

export interface DiffSample {
  asin: string;
  field: string;
  seeded: string;
  sheetNow: string;
  catalogNow: string;
}

export interface DiffResult {
  counts: Record<DiffBucket, number>;
  samples: Record<DiffBucket, DiffSample[]>;
  /** `${rowKey}${DIFF_KEY_SEP}${field}` → bucket */
  bucketsByKey: Record<string, DiffBucket>;
}

/**
 * Separator used between rowKey and field in {@link DiffResult.bucketsByKey}
 * map keys. ASCII Unit Separator (U+001F) — chosen because no realistic
 * ASIN, SKU, or attribute generalLabel will ever contain it, eliminating the
 * ambiguity that a `:` delimiter introduces when a field name itself contains
 * a colon. Consumers MUST use `lastIndexOf(DIFF_KEY_SEP)` to recover both
 * parts (rowKey itself may contain a colon, e.g. a synthetic `sku:<sku>` key).
 */
export const DIFF_KEY_SEP = "";

const SAMPLE_CAP = 200;

function norm(v: string | null | undefined): string {
  return (v ?? "").trim();
}

export function computeDiff(input: DiffInput): DiffResult {
  const counts: Record<DiffBucket, number> = {
    unchanged: 0, clientEdited: 0, catalogDrifted: 0, conflict: 0,
  };
  const samples: Record<DiffBucket, DiffSample[]> = {
    unchanged: [], clientEdited: [], catalogDrifted: [], conflict: [],
  };
  const bucketsByKey: Record<string, DiffBucket> = {};

  // Union of all asin×field keys across the three maps
  const asins = new Set<string>([
    ...Object.keys(input.seeded),
    ...Object.keys(input.sheetNow),
    ...Object.keys(input.catalogNow),
  ]);

  for (const asin of asins) {
    const fields = new Set<string>([
      ...Object.keys(input.seeded[asin] ?? {}),
      ...Object.keys(input.sheetNow[asin] ?? {}),
      ...Object.keys(input.catalogNow[asin] ?? {}),
    ]);
    for (const field of fields) {
      const s = norm(input.seeded[asin]?.[field]);
      const n = norm(input.sheetNow[asin]?.[field]);
      const c = norm(input.catalogNow[asin]?.[field]);

      let bucket: DiffBucket;
      if (s === n && n === c) {
        bucket = "unchanged";
      } else if (s === c && s !== n) {
        bucket = "clientEdited";
      } else if (s === n && s !== c) {
        bucket = "catalogDrifted";
      } else if (n === c) {
        // both converged on the same new value — treat as unchanged
        bucket = "unchanged";
      } else {
        bucket = "conflict";
      }

      counts[bucket]++;
      bucketsByKey[`${asin}${DIFF_KEY_SEP}${field}`] = bucket;
      if (samples[bucket].length < SAMPLE_CAP) {
        samples[bucket].push({ asin, field, seeded: s, sheetNow: n, catalogNow: c });
      }
    }
  }

  return { counts, samples, bucketsByKey };
}
