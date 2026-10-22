/**
 * Nightly drainer (spec §7.1). Claims pending redshift_archive_runs rows one
 * at a time and works them until the time budget expires. Sequential by
 * design (Deviation 3 in the plan) — the BigQuery loader stages into a
 * fixed-name table per source table, so two units for the same table must
 * never run concurrently.
 *
 * A unit that fails goes back to 'pending' and is retried, up to 3 attempts
 * total, after which it is marked 'failed' (terminal) with its error text. One
 * failing unit never blocks the rest of the drain. Retries are ordered LAST
 * (see claimOne's ORDER BY): every never-attempted unit in the queue is worked
 * before any retry, so a retry normally lands on a later drain — but if the
 * queue drains empty inside one budget window, a retry can still happen within
 * the same drain rather than being artificially deferred.
 *
 * Only ONE drain may run at a time, across processes: runDrain holds a Postgres
 * advisory lock for its whole duration and returns immediately with
 * lockSkipped=true if another drain already holds it.
 */
import { sql, eq, and, lt } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/lib/db";
import { redshiftArchiveRuns, redshiftArchiveCatalog } from "@/lib/db/schema";
import { loadWorkUnit, type CatalogRowForArchive, type ArchiveColumn } from "@/lib/archive/bigquery-archive";
import { toSessionModeUrl } from "@/lib/archive/pooler-url";

const MAX_ATTEMPTS = 3;

/**
 * Time budget for one drain, in ms. runDrain still takes budgetMs as an
 * option (tests and scoped runs pass their own); this is the value both real
 * callers use — the cron route and scripts/archive-drain.ts — so the two can
 * never drift.
 *
 * Was 250_000, which left a 50s tail below the cron route's maxDuration=300
 * ceiling — SMALLER than the worst single unit ever observed (58.6s,
 * 2026-08-14). drainLoop's `while (Date.now() < deadline)` admits a unit at
 * 249s elapsed, which then overruns the 300s hard stop and is killed
 * mid-flight, leaving a 'running' row that claimOne() never looks at and
 * reclaimStaleRuns() only sweeps after STALE_RUNNING_MS = 1h. That costs an
 * hour and an attempt; it does not lose data.
 *
 * 200_000 leaves a 100s tail, ~1.7x that worst unit. Affordable because the
 * empty-unit skip removed ~41% of the nightly work, so a shorter window costs
 * nothing. 58.6s is a floor, not a ceiling: it was measured while
 * share_of_voice's window was already two days depleted.
 */
export const DRAIN_BUDGET_MS = 200_000;

/**
 * Advisory-lock key for "a drain is in progress". hashtext() maps it to the
 * int the lock functions want, so no migration and no lock-key registry.
 */
const DRAIN_LOCK_NAME = "redshift_archive_drain";

// A unit claimed but never finished (killed mid-flight by the route's
// maxDuration=300 hard stop, an OOM, a deploy restart, ...) is stuck in
// 'running' forever, since claimOne() only ever looks at 'pending' rows.
// reclaimStaleRuns() (below) sweeps those up once per drain.
//
// This threshold is deliberately generous — 60 minutes, not the 20 minutes
// first suggested — because it must exceed any legitimate single-unit
// runtime, and it can't be tuned to the cron route's 300s ceiling: the CLI
// wrapper (scripts/archive-drain.ts) runs with NO ceiling at all, so a manual
// `npm run archive-drain` against a large table can legitimately still be
// mid-unit well past a tighter threshold. Reclaiming a unit that is genuinely
// still in flight would let a second loadWorkUnit start against the same
// fixed-name staging table — exactly the race Deviation 3's sequential-only
// design exists to prevent.
const STALE_RUNNING_MS = 60 * 60 * 1000;

interface ClaimedRun {
  id: string;
  schemaName: string;
  tableName: string;
  accountId: string;
  windowFrom: string | null;
  windowTo: string | null;
  attempts: number;
}

async function claimOne(): Promise<ClaimedRun | null> {
  const rows = await db.execute(sql`
    UPDATE redshift_archive_runs
    SET status = 'running', claimed_at = now(), started_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM redshift_archive_runs
      WHERE status = 'pending'
      -- attempts FIRST: a failed unit returns to 'pending', and under the old
      -- ordering it was still the lowest-ordered row, so it was re-claimed
      -- immediately with no backoff and burned all 3 attempts back-to-back
      -- within seconds. Phase 0 already recorded 90s Redshift timeouts on two
      -- priority tables; 3 x 90s also exceeds the whole 250s drain budget, so
      -- one pathological unit could consume an entire drain window. Ordering
      -- never-attempted units first costs the incidental same-table grouping
      -- the old ordering gave (consecutive units reusing a staging table with
      -- an unchanged schema) — correct retry separation is worth more.
      ORDER BY attempts, run_date, schema_name, table_name, account_id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, schema_name, table_name, account_id, window_from, window_to, attempts
  `);
  const list = rows as unknown as Array<{
    id: string; schema_name: string; table_name: string; account_id: string;
    window_from: string | null; window_to: string | null; attempts: number;
  }>;
  if (list.length === 0) return null;
  const r = list[0];
  return {
    id: r.id,
    schemaName: r.schema_name,
    tableName: r.table_name,
    accountId: r.account_id,
    windowFrom: r.window_from,
    windowTo: r.window_to,
    attempts: r.attempts,
  };
}

export interface DrainResult {
  claimed: number;
  done: number;
  failed: number;
  retried: number;
  // Not part of the brief's original 4-field interface. Added deliberately: a
  // reclaim that happens silently is nearly as bad as the orphaning bug it
  // fixes, since nobody could otherwise tell it occurred. Rows this sweep
  // promotes straight to terminal 'failed' are counted here AND in `failed`,
  // so done + failed + retried never undercounts a run's real outcomes.
  reclaimed: number;
  // Same reasoning: a drain that did nothing because another drain held the
  // lock must be distinguishable from a drain that found an empty queue. Both
  // report claimed=0.
  lockSkipped: boolean;
}

interface FailurePatch {
  status: "pending" | "failed";
  error: string;
  finishedAt: Date | null;
  claimedAt: undefined | null;
}

/**
 * The retry-vs-terminal decision for a failed (or orphaned) unit, as a pure
 * function of how many attempts it has already used. Used identically by
 * runDrain's catch branch and by reclaimStaleRuns — both are answering the
 * same question ("has this unit exhausted its attempts?"), just for
 * different reasons a unit didn't finish.
 *
 * claimedAt is `undefined` on a terminal failure — Drizzle's `.set()` omits
 * undefined keys from the SQL SET clause, so the claim timestamp written at
 * claim time survives on the dead row as provenance — versus `null` on a
 * retry, which genuinely clears it so the row looks freshly pending again.
 * That distinction is load-bearing; do not collapse it to one value.
 */
export function computeFailurePatch(attempts: number, errorMsg: string, now: Date): FailurePatch {
  const terminal = attempts >= MAX_ATTEMPTS;
  return {
    status: terminal ? "failed" : "pending",
    error: errorMsg,
    finishedAt: terminal ? now : null,
    claimedAt: terminal ? undefined : null,
  };
}

/**
 * Sweeps rows stuck in 'running' past STALE_RUNNING_MS back to 'pending' (or
 * to terminal 'failed' if they've already used up their attempts) so a
 * process death mid-unit can't strand a row forever. Runs once at the top of
 * runDrain, INSIDE the advisory lock and before the claim loop — one step per
 * drain, not one check per claim.
 *
 * Returns the breakdown, not just a total: a row this sweep promotes straight
 * to terminal 'failed' is a real terminal failure for the run, and folding it
 * into DrainResult.failed is what stops done + failed + retried from
 * undercounting the summary a human actually reads.
 */
async function reclaimStaleRuns(): Promise<{ reclaimed: number; failed: number; retried: number }> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS);
  const staleRows = await db
    .select({ id: redshiftArchiveRuns.id, attempts: redshiftArchiveRuns.attempts })
    .from(redshiftArchiveRuns)
    .where(and(eq(redshiftArchiveRuns.status, "running"), lt(redshiftArchiveRuns.claimedAt, cutoff)));

  const out = { reclaimed: staleRows.length, failed: 0, retried: 0 };
  for (const row of staleRows) {
    const patch = computeFailurePatch(row.attempts, "reclaimed: orphaned in running (process died mid-unit)", new Date());
    await db.update(redshiftArchiveRuns).set(patch).where(eq(redshiftArchiveRuns.id, row.id));
    if (patch.status === "failed") out.failed++;
    else out.retried++;
  }
  return out;
}

/**
 * Works the queue until the time budget expires.
 *
 * MUTUAL EXCLUSION: holds pg_try_advisory_lock(hashtext('redshift_archive_drain'))
 * for the whole drain. `FOR UPDATE SKIP LOCKED` prevents two claimers from
 * taking the SAME row, but it does nothing about two PROCESSES taking
 * DIFFERENT rows for the same source table — and both would stage into the
 * same fixed-name `_stg_{schema}__{table}`, so account B's staged rows could be
 * inserted inside the transaction that deleted account A's window. That is
 * silent cross-account corruption in the system of record, and it is realistic
 * during manual debugging (two terminals, or a manual drain while a cron
 * fires). The lock extends Deviation 3's sequential-only intent across
 * processes; the goal is not concurrency, it is making ACCIDENTAL concurrency
 * impossible.
 *
 * The lock is taken on a DEDICATED single connection, not on the shared
 * drizzle/postgres-js pool. Advisory locks are session-scoped, and that pool is
 * max:10 locally — taking the lock there would put it on an arbitrary pooled
 * connection whose matching unlock could land on a DIFFERENT connection,
 * return false and leak the lock. On a long-lived process (dev server, warm
 * Vercel instance) a leaked lock would silently disable nightly archival
 * forever: strictly worse than the bug being fixed. `sql.reserve()` is ruled
 * out too — reserving the pool's only connection on Vercel (max:1) would
 * starve every `db` query in the drain and deadlock. A private client
 * guarantees lock and unlock share one session, and process death closes the
 * connection so Postgres releases the lock automatically: it cannot leak.
 * Cost is +1 Supabase connection for the drain's duration.
 *
 * This also subsumes the concern that STALE_RUNNING_MS is a wall-clock cutoff
 * rather than a lease: with the lock held, a unit reclaimed while genuinely
 * still in flight cannot be double-worked by another process, because there is
 * no other process. No heartbeat/lease machinery is needed.
 */
export async function runDrain(opts: { budgetMs: number; limit?: number }): Promise<DrainResult> {
  const deadline = Date.now() + opts.budgetMs;
  const result: DrainResult = { claimed: 0, done: 0, failed: 0, retried: 0, reclaimed: 0, lockSkipped: false };

  // Session-mode (port 5432 on the same pooler host), not the shared `db`
  // pool's transaction-mode 6543 — advisory locks are session-scoped and are
  // not reliably held/released over Supavisor's transaction pooler. See
  // toSessionModeUrl's docstring.
  const lockClient = postgres(toSessionModeUrl(process.env.DATABASE_URL!), {
    prepare: false,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    max: 1,
  });
  let acquired = false;
  try {
    const [lockRow] = await lockClient<Array<{ locked: boolean }>>`
      SELECT pg_try_advisory_lock(hashtext(${DRAIN_LOCK_NAME})) AS locked
    `;
    acquired = lockRow?.locked === true;
    if (!acquired) {
      result.lockSkipped = true;
      console.warn("[archive-drain] another drain holds the advisory lock — skipping, claimed nothing");
      return result;
    }
    return await drainLoop(opts, deadline, result);
  } finally {
    // Closing this connection is what actually guarantees release, so a failed
    // unlock must not mask a drain error — hence the swallow.
    if (acquired) {
      try {
        await lockClient`SELECT pg_advisory_unlock(hashtext(${DRAIN_LOCK_NAME}))`;
      } catch (e) {
        console.warn("[archive-drain] advisory unlock failed; closing the connection releases it:", e);
      }
    }
    await lockClient.end({ timeout: 5 });
  }
}

/** The claim/work loop. Only ever called with the drain advisory lock held. */
async function drainLoop(
  opts: { budgetMs: number; limit?: number },
  deadline: number,
  result: DrainResult
): Promise<DrainResult> {
  const reclaim = await reclaimStaleRuns();
  result.reclaimed = reclaim.reclaimed;
  result.failed += reclaim.failed;
  result.retried += reclaim.retried;

  while (Date.now() < deadline) {
    if (opts.limit !== undefined && result.claimed >= opts.limit) break;

    const claimed = await claimOne();
    if (!claimed) break;
    result.claimed++;

    // Manual verification recipe (no DB-integration harness exists for this
    // module — see the plan's Global Constraints): insert one
    // redshift_archive_catalog row with enabled=false and one matching
    // redshift_archive_runs row with status='pending', run
    // `npm run archive-drain -- --limit=1`, confirm the run lands on
    // status='failed' with error 'catalog row not found or disabled...'
    // rather than attempting a load.
    const [catalogRow] = await db
      .select()
      .from(redshiftArchiveCatalog)
      .where(
        and(
          eq(redshiftArchiveCatalog.schemaName, claimed.schemaName),
          eq(redshiftArchiveCatalog.tableName, claimed.tableName),
          eq(redshiftArchiveCatalog.enabled, true)
        )
      )
      .limit(1);

    if (!catalogRow) {
      await db
        .update(redshiftArchiveRuns)
        .set({ status: "failed", error: "catalog row not found or disabled (type drift pending review)", finishedAt: new Date() })
        .where(eq(redshiftArchiveRuns.id, claimed.id));
      result.failed++;
      continue;
    }

    const catalogRowForArchive: CatalogRowForArchive = {
      schemaName: catalogRow.schemaName,
      tableName: catalogRow.tableName,
      tableKind: catalogRow.tableKind,
      dateColumn: catalogRow.dateColumn,
      // `type` is the RAW Redshift type. It must survive this hop: without it
      // loadWorkUnit cannot tell a naive `timestamp` from a `timestamptz`, and
      // those need opposite treatment on the way into BigQuery.
      columns: (catalogRow.columns ?? []) as ArchiveColumn[],
    };

    try {
      const { rowsRead, rowsWritten } = await loadWorkUnit({
        catalogRow: catalogRowForArchive,
        accountId: claimed.accountId,
        windowFrom: claimed.windowFrom,
        windowTo: claimed.windowTo,
        archivedAt: new Date(),
      });
      await db
        .update(redshiftArchiveRuns)
        .set({ status: "done", rowsRead, rowsWritten, finishedAt: new Date() })
        .where(eq(redshiftArchiveRuns.id, claimed.id));
      result.done++;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const patch = computeFailurePatch(claimed.attempts, errorMsg, new Date());
      await db
        .update(redshiftArchiveRuns)
        .set(patch)
        .where(eq(redshiftArchiveRuns.id, claimed.id));
      if (patch.status === "failed") result.failed++;
      else result.retried++;
      console.error(`[archive-drain] ${claimed.schemaName}.${claimed.tableName} account=${claimed.accountId} attempt=${claimed.attempts}:`, errorMsg);
    }
  }

  return result;
}
