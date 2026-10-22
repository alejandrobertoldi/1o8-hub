/**
 * Pure work-unit computation for the nightly archive enqueuer (spec §7.1).
 *
 * No I/O. The enqueuer reads accounts/clients/catalog from the DB and hands
 * plain objects in here; everything about WHICH (table, account, window)
 * tuples are due tonight is decided here and is fully unit testable.
 */
import type { TableKind } from "@/lib/archive/catalog";

export interface AccountLifecycleInput {
  accountId: string;
  clientIdCode: string | null;
  isActive: boolean;
}

export interface ClientLifecycleInput {
  clientIdCode: string;
  clientStatus: string;
  offboardingDate: Date | string | null;
}

/**
 * The §7.1 enqueuer predicate, extended with the two locked lifecycle-gate
 * decisions from the Phase 0 Task 8 checkpoint (2026-08-03):
 *
 *   - is_active = false always excludes (Plan 2D's offboarding gate owns
 *     flipping this; this function only ever reads it).
 *   - client_id_code IS NULL (unmapped) FAILS OPEN — archived anyway
 *     (decision 3/5). This is different from a client_id_code that IS set
 *     but matches no aac row at all, which is treated as an inconsistent
 *     mapping and fails CLOSED — that case means our own data is wrong,
 *     not that the account is unattributed by design.
 *   - A mapped account's client must have client_status = 'active'
 *     (case-insensitive, matching src/app/api/clients/route.ts:55's ilike
 *     convention) and either no offboarding_date or one still in the future.
 */
export function selectEligibleAccounts(
  accounts: AccountLifecycleInput[],
  clients: ClientLifecycleInput[],
  now: Date
): AccountLifecycleInput[] {
  const clientByCode = new Map(clients.map((c) => [c.clientIdCode, c]));

  return accounts.filter((a) => {
    if (!a.isActive) return false;
    if (a.clientIdCode === null) return true; // fail open — locked decision 3/5

    const client = clientByCode.get(a.clientIdCode);
    if (!client) return false; // orphaned mapping — fail closed, not the same as unmapped

    if (client.clientStatus.toLowerCase() !== "active") return false;
    if (client.offboardingDate) {
      const offboarding = new Date(client.offboardingDate).getTime();
      if (offboarding <= now.getTime()) return false;
    }
    return true;
  });
}

/**
 * Format a Date using UTC components. Only ever used on a run date this
 * process just created (e.g. `new Date()` inside the cron handler), never on
 * a value read back from a DB driver — that case (Redshift DATE -> local
 * midnight Date) is a different problem solved in
 * scripts/profile-redshift-catalog.ts's toDateOnlyString and must NOT reuse
 * this function.
 */
export function formatUtcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * snapshot tables have no date column and overwrite in place at the source —
 * there is nothing to window. timeseries and period tables both use the
 * table's own repull_window_days (spec §7.1's 14-day default).
 */
export function computeWindow(
  tableKind: TableKind,
  repullWindowDays: number,
  runDate: Date
): { windowFrom: string | null; windowTo: string | null } {
  if (tableKind === "snapshot") return { windowFrom: null, windowTo: null };
  const windowTo = formatUtcDate(runDate);
  const from = new Date(runDate);
  from.setUTCDate(from.getUTCDate() - repullWindowDays);
  const windowFrom = formatUtcDate(from);
  return { windowFrom, windowTo };
}

export interface CatalogRowForUnits {
  schemaName: string;
  tableName: string;
  tableKind: TableKind;
  repullWindowDays: number;
}

export interface WorkUnit {
  schemaName: string;
  tableName: string;
  accountId: string;
  windowFrom: string | null;
  windowTo: string | null;
}

/**
 * Cartesian product of enabled catalog rows x eligible accounts, windowed,
 * minus the units the skip predicate declines tonight.
 *
 * `history` is optional and defaults to empty, which means "enqueue
 * everything" — the pre-skip behaviour. That default is load-bearing in two
 * places: the enqueuer passes an empty map when its history read fails (the
 * skip is an optimisation, never a correctness dependency), and any future
 * non-nightly caller (backfill, verify) gets full fanout by simply not
 * passing history.
 *
 * CORRECTNESS INVARIANT (timeseries and period tables): every run re-reads
 * [run_date - repull_window_days, run_date], and a probe fires at most
 * floor(repull_window_days / 2) days apart. Since cadence < repull window, a
 * probe's own window covers the entire skipped gap, so an account that starts
 * producing data is archived LATE, never LOST — a wrong skip costs <= cadence
 * days of latency and zero rows.
 *
 * The invariant is WEAKER for snapshot tables (refdata_label): a snapshot has
 * no window to re-read, so a probe yields the source's current state but the
 * per-day snapshots in between are gone. For the accounts that have never had
 * a single label row this costs nothing real. Accepted deliberately, not by
 * oversight.
 */
export function buildNightlyWorkUnits(
  catalogRows: CatalogRowForUnits[],
  eligibleAccounts: AccountLifecycleInput[],
  runDate: Date,
  history: Map<string, UnitHistory> = new Map()
): NightlyWorkUnitPlan {
  const units: WorkUnit[] = [];
  let unitsSkipped = 0;
  let unitsProbed = 0;

  for (const row of catalogRows) {
    const { windowFrom, windowTo } = computeWindow(row.tableKind, row.repullWindowDays, runDate);
    for (const account of eligibleAccounts) {
      const key = unitHistoryKey(row.schemaName, row.tableName, account.accountId);
      const decision = decideUnit(history.get(key), runDate, key, row.repullWindowDays);
      if (decision === "skip") {
        unitsSkipped++;
        continue;
      }
      if (decision === "enqueue-probe") unitsProbed++;
      units.push({
        schemaName: row.schemaName,
        tableName: row.tableName,
        accountId: account.accountId,
        windowFrom,
        windowTo,
      });
    }
  }
  return { units, unitsSkipped, unitsProbed };
}

// ─── Empty-unit skip (design docs/superpowers/specs/2026-08-17-archive-empty-unit-skip-design.md) ───
//
// 257 of the 384 nightly units read zero rows and have done so on every night
// observed, costing 1,411s/night (47.5% of total drain time) to produce
// nothing. They are the binding constraint on enabling more tables.
//
// The naive rule — "demote after N consecutive zero nights" — is unsafe and
// would fire right now: share_of_voice's SOURCE has stalled (MAX(time_stamp)
// identical on all ten data-bearing accounts), so its ten proven accounts
// start reading zero from 2026-08-24. A zero-row rule cannot tell "no data by
// design" from "the pipeline broke", and would demote the most valuable table
// in the archive. Hence rule 1 below: EVER produced rows => never demoted.
//
// The rows_read history IS the state. No new table, no new column, no counter.

/** One (schema, table, account) unit's archival history, as read by the enqueuer. */
export interface UnitHistory {
  /** Rows with status='done' AND run_kind='nightly' for this unit. */
  nightlyObservations: number;
  /** max(coalesce(rows_read, 0)) across ALL run kinds with status='done'. */
  peakRows: number;
}

/**
 * Nightly observations required before a unit may be skipped at all.
 *
 * Deliberately aggressive, and safe to be: three consecutive zero nights are
 * NOT three independent observations — consecutive 14-day repull windows
 * overlap by 13/14, so three nights is roughly one look at a 16-day span, and
 * waiting ten nights would buy only a 24-day span. The evidence barely
 * improves with patience. It is the PROBE, not the waiting, that makes the
 * skip safe (see isProbeNight).
 */
export const MIN_OBSERVED_NIGHTS = 3;

/**
 * Canonical map key for a work unit. The enqueuer builds the history map with
 * this same function, so the two sides can never drift.
 */
export function unitHistoryKey(schemaName: string, tableName: string, accountId: string): string {
  return `${schemaName}.${tableName}:${accountId}`;
}

/**
 * FNV-1a, 32-bit. Non-cryptographic on purpose; all that is required is that
 * it be deterministic across processes and deploys (so a unit keeps its probe
 * phase forever) and well spread (so probes do not clump). Math.imul keeps the
 * multiply in 32-bit space, and the >>> 0 keeps the result unsigned so the
 * modulo in isProbeNight can never go negative.
 */
export function hashUnitKey(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * How often an always-empty unit is probed, in days: half the table's own
 * repull window, floored, minimum 1.
 *
 * Derived per table rather than hardcoded to 7 (which is what all eight
 * enabled tables resolve to today, since they all use 14) so that shortening
 * a table's repull window cannot silently erase the safety margin the
 * correctness invariant depends on. A cadence of 1 means "probe every night",
 * i.e. that table is effectively never skipped.
 */
export function probeCadence(repullWindowDays: number): number {
  return Math.max(1, Math.floor(repullWindowDays / 2));
}

/** Whole days since the Unix epoch, by UTC calendar date. */
export function utcDayNumber(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

/**
 * Is tonight this unit's probe night?
 *
 * A PHASE rule, not a gap rule. "Days since last run >= cadence" would sync
 * all 257 always-empty units — they were all last run on the same night —
 * into a single 257-unit herd every seventh night. Offsetting the UTC day
 * number by a hash of the unit key spreads them to ~37 per night, and makes
 * "every unit probes exactly once per `cadence` consecutive days" a provable
 * invariant rather than an estimate.
 */
export function isProbeNight(runDate: Date, unitKey: string, cadence: number): boolean {
  return (utcDayNumber(runDate) + hashUnitKey(unitKey)) % cadence === 0;
}

/**
 * Why a unit is being enqueued, or that it is being skipped. A plain boolean
 * would do for the filter, but the enqueuer also reports how many units were
 * probed tonight, which needs the reason.
 */
export type UnitDecision =
  | "enqueue-no-history"
  | "enqueue-proven"
  | "enqueue-insufficient-evidence"
  | "enqueue-probe"
  | "skip";

/**
 * The skip predicate. Every branch except the last two fails OPEN.
 *
 *   no history            -> enqueue (never observed)
 *   peakRows > 0          -> enqueue (proven; NEVER demoted, at any age)
 *   observations < floor  -> enqueue (too little evidence)
 *   probe night           -> enqueue (the periodic look)
 *   otherwise             -> skip
 */
export function decideUnit(
  history: UnitHistory | undefined,
  runDate: Date,
  unitKey: string,
  repullWindowDays: number
): UnitDecision {
  if (!history) return "enqueue-no-history";
  if (history.peakRows > 0) return "enqueue-proven";
  if (history.nightlyObservations < MIN_OBSERVED_NIGHTS) return "enqueue-insufficient-evidence";
  return isProbeNight(runDate, unitKey, probeCadence(repullWindowDays)) ? "enqueue-probe" : "skip";
}

/** What tonight's enqueue should insert, plus what it chose not to. */
export interface NightlyWorkUnitPlan {
  units: WorkUnit[];
  unitsSkipped: number;
  unitsProbed: number;
}
