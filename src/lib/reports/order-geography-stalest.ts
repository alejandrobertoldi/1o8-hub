/** Each day's refresh cycle starts at the cron's first run (vercel.json). */
const CYCLE_START_HOUR_UTC = 11;

/** The most recent 11:00 UTC at or before `now`: a snapshot refreshed since then is done for today. */
function cycleStart(now: Date): number {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), CYCLE_START_HOUR_UTC);
  return start <= now.getTime() ? start : start - 24 * 3_600_000;
}

/**
 * Choose which accounts the next cron run rebuilds: never-snapshotted first,
 * then the oldest snapshots, skipping any already refreshed in today's cycle.
 *
 * The cron refreshes a couple at a time because the Redshift datashare slows
 * every scan when several run at once — on 2026-09-23 eight concurrent scans
 * each ran ~400s, past both the 240s query timeout and the 300s function
 * limit, and none was written. Even two at a time, a scan takes 33s-513s
 * depending on load on the datashare, so ~40% of runs fail. The afternoon
 * retry runs therefore find only the accounts that failed today, and go quiet
 * once none are left.
 *
 * The cutoff is today's 11:00 UTC rather than a fixed age so an account
 * retried late one afternoon is still due at 11:00 the next day, instead of
 * drifting later each time it fails.
 */
export function pickStalestAccounts(
  accountIds: string[],
  refreshedAt: Map<string, Date>,
  now: Date,
  limit: number,
): string[] {
  const cutoff = cycleStart(now);
  return accountIds
    .map((id) => ({ id, at: refreshedAt.get(id)?.getTime() ?? -Infinity }))
    .filter((a) => a.at < cutoff)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((a) => a.id);
}
