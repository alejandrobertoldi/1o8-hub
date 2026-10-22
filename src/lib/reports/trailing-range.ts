import { formatDate } from "@/lib/report-date-range";

/**
 * Lookback presets for the Order Geography report.
 *
 * The shared report controls only offer "week" and "custom", and their state is
 * held in a provider above every report page, so a page that wants a year-long
 * default cannot simply set it without changing every sibling page's range.
 * These presets back that page's own local range instead.
 */
export const TRAILING_PRESETS = [
  { id: "365", label: "365 days", days: 365 },
  { id: "180", label: "180 days", days: 180 },
  { id: "90", label: "90 days", days: 90 },
] as const;

export type TrailingPresetId = (typeof TRAILING_PRESETS)[number]["id"] | "custom";

export const DEFAULT_TRAILING_PRESET: TrailingPresetId = "365";

/**
 * A trailing window ending yesterday.
 *
 * Ending yesterday rather than today keeps the cache key stable for a whole
 * day, and today's orders are partial anyway.
 */
export function trailingRange(days: number, now: Date = new Date()): { start: string; end: string } {
  const end = new Date(now);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: formatDate(start), end: formatDate(end) };
}

/**
 * The windows the cron warms — every non-custom preset the page offers, so
 * switching preset is a cache hit rather than a fresh ~70s scan.
 *
 * All three share one end date, so the shorter ones are strict subsets of the
 * longest and the warm job can derive them from a single scan.
 */
export function warmedTrailingWindows(now: Date = new Date()): {
  days: number;
  start: string;
  end: string;
}[] {
  return TRAILING_PRESETS.map((p) => ({ days: p.days, ...trailingRange(p.days, now) }));
}

/** The widest warmed window — the one scan the others are sliced from. */
export function widestTrailingWindow(now: Date = new Date()): { start: string; end: string } {
  const widest = Math.max(...TRAILING_PRESETS.map((p) => p.days));
  return trailingRange(widest, now);
}
