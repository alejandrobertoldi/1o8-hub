import type { CerebroRow } from "./cerebro";

export interface CerebroFilterConfig {
  /** Minimum search volume (inclusive). 0 = disabled. */
  minSearchVolume: number;
  /** Maximum organic position/rank (inclusive). 0 = disabled. */
  maxOrganicRank: number;
  /** Minimum word count in keyword phrase. 0 = disabled. */
  minWordCount: number;
  /** Maximum word count. 0 = disabled. */
  maxWordCount: number;
  /** Drop any phrase containing one of these substrings (case-insensitive). */
  excludeWords: string[];
}

export const defaultFilterConfig: CerebroFilterConfig = {
  minSearchVolume: 100,
  maxOrganicRank: 0,
  minWordCount: 0,
  maxWordCount: 0,
  excludeWords: [],
};

export type DropReason =
  | "low_volume"
  | "rank_too_low"
  | "word_count_too_low"
  | "word_count_too_high"
  | "excluded_word";

export interface CerebroFilterResult {
  kept: CerebroRow[];
  dropped: { reason: DropReason; count: number }[];
}

export function applyCerebroFilters(
  rows: CerebroRow[],
  config: CerebroFilterConfig,
): CerebroFilterResult {
  const counts: Record<DropReason, number> = {
    low_volume: 0,
    rank_too_low: 0,
    word_count_too_low: 0,
    word_count_too_high: 0,
    excluded_word: 0,
  };
  const excludeLower = config.excludeWords.map((w) => w.toLowerCase()).filter(Boolean);
  const kept: CerebroRow[] = [];

  for (const r of rows) {
    if (config.minSearchVolume > 0 && r.search_volume < config.minSearchVolume) {
      counts.low_volume++;
      continue;
    }
    if (config.maxOrganicRank > 0 && r.position > 0 && r.position > config.maxOrganicRank) {
      counts.rank_too_low++;
      continue;
    }
    const wc = r.keyword_phrase.trim().split(/\s+/).filter(Boolean).length;
    if (config.minWordCount > 0 && wc < config.minWordCount) {
      counts.word_count_too_low++;
      continue;
    }
    if (config.maxWordCount > 0 && wc > config.maxWordCount) {
      counts.word_count_too_high++;
      continue;
    }
    const phraseLower = r.keyword_phrase.toLowerCase();
    if (excludeLower.some((w) => phraseLower.includes(w))) {
      counts.excluded_word++;
      continue;
    }
    kept.push(r);
  }

  const dropped = (Object.entries(counts) as [DropReason, number][])
    .filter(([, c]) => c > 0)
    .map(([reason, count]) => ({ reason, count }));

  return { kept, dropped };
}
