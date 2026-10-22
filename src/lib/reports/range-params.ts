const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional ?start&end deep-link params; null unless both are valid and ordered. */
export function parseRangeParams(start: string | null, end: string | null): { start: string; end: string } | null {
  if (!start || !end || !DAY_RE.test(start) || !DAY_RE.test(end) || start > end) return null;
  return { start, end };
}
