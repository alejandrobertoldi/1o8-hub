// keyword-merge.ts — one row per phrase across Helium 10 keywords and SQP queries
// (S6 keyword panel). H10 volume is a monthly estimate; SQP volume is a sum over
// the SQP window, so it is converted to a monthly figure before the two sit
// side by side.

export interface H10Keyword {
  text: string;
  tier: number;
  volume: number;
}

export interface SqpQueryRow {
  search_query: string;
  search_query_volume: number;
  asin_purchase_count: number;
  asin_purchase_share: number;
  asin_cart_add_share: number;
  asin_click_share: number;
  asin_impression_share: number;
}

export interface MergedKeyword {
  /** Normalised phrase — the identity used for de-duplication. */
  key: string;
  /** Phrase as displayed (H10 wording wins when both sources have it). */
  text: string;
  inH10: boolean;
  inSqp: boolean;
  tier: number | null;
  h10Volume: number | null;
  sqpVolume8wk: number | null;
  sqpVolumeMonthly: number | null;
  purchases: number | null;
  purchaseShare: number | null;
  cartShare: number | null;
  clickShare: number | null;
  impressionShare: number | null;
}

const WEEKS_PER_MONTH = 52 / 12;

export function normalizeKeyword(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function sqpMonthlyVolume(windowTotal: number, weeks: number): number {
  if (!weeks || weeks <= 0) return 0;
  return Math.round((windowTotal / weeks) * WEEKS_PER_MONTH);
}

export function mergeKeywordSources(h10: H10Keyword[], sqp: SqpQueryRow[], sqpWeeks: number): MergedKeyword[] {
  const byKey = new Map<string, MergedKeyword>();

  for (const k of h10) {
    const key = normalizeKeyword(k.text);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, {
      key, text: key, inH10: true, inSqp: false,
      tier: k.tier, h10Volume: k.volume > 0 ? k.volume : null,
      sqpVolume8wk: null, sqpVolumeMonthly: null, purchases: null,
      purchaseShare: null, cartShare: null, clickShare: null, impressionShare: null,
    });
  }

  for (const q of sqp) {
    const key = normalizeKeyword(String(q.search_query ?? ""));
    if (!key) continue;
    const existing = byKey.get(key);
    if (existing?.inSqp) continue;
    const vol = Number(q.search_query_volume) || 0;
    const sqpFields = {
      inSqp: true,
      sqpVolume8wk: vol,
      sqpVolumeMonthly: sqpMonthlyVolume(vol, sqpWeeks),
      purchases: Number(q.asin_purchase_count) || 0,
      purchaseShare: Number(q.asin_purchase_share) || 0,
      cartShare: Number(q.asin_cart_add_share) || 0,
      clickShare: Number(q.asin_click_share) || 0,
      impressionShare: Number(q.asin_impression_share) || 0,
    };
    if (existing) Object.assign(existing, sqpFields);
    else byKey.set(key, { key, text: key, inH10: false, tier: null, h10Volume: null, ...sqpFields });
  }

  return [...byKey.values()].sort((a, b) =>
    (b.purchases ?? -1) - (a.purchases ?? -1) ||
    (b.h10Volume ?? b.sqpVolumeMonthly ?? 0) - (a.h10Volume ?? a.sqpVolumeMonthly ?? 0) ||
    (a.tier ?? 9) - (b.tier ?? 9) ||
    a.key.localeCompare(b.key)
  );
}
