/**
 * A malformed --limit (typo, empty value) must fail loudly, not silently
 * disable the limit: parseInt("one", 10) is NaN, and NaN !== undefined, so a
 * naive `opts.limit !== undefined && claimed >= opts.limit` guard never
 * trips — an operator asking for a scoped 1-unit smoke test would instead
 * run a full unbounded production drain.
 */
export function parseLimitArg(args: string[]): number | undefined {
  const limitArg = args.find((a) => a.startsWith("--limit="));
  if (!limitArg) return undefined;
  const raw = limitArg.slice("--limit=".length);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--limit must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}
