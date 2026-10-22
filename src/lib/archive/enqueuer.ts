/**
 * Nightly enqueuer (spec §7.1). Computes tonight's work units and inserts
 * them into redshift_archive_runs as 'pending'. Idempotent: re-running for a
 * date that already has rows inserts nothing new (unique constraint +
 * onConflictDoNothing), so a manual re-trigger is always safe.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { redshiftArchiveCatalog, redshiftArchiveRuns, intentwiseAccounts, aac } from "@/lib/db/schema";
import {
  selectEligibleAccounts,
  buildNightlyWorkUnits,
  formatUtcDate,
  unitHistoryKey,
  type UnitHistory,
} from "@/lib/archive/work-units";

export interface EnqueueResult {
  runDate: string;
  enabledTables: number;
  eligibleAccounts: number;
  /**
   * Units actually enqueued. Before the empty-unit skip this was always the
   * full (tables x accounts) product; it is now that product MINUS
   * unitsSkipped. unitsComputed + unitsSkipped recovers the Cartesian size,
   * which is also how a degraded night is spotted: if the history read fails,
   * this reads 384 with unitsSkipped 0.
   */
  unitsComputed: number;
  unitsInserted: number;
  /** Always-empty units the skip predicate declined tonight. */
  unitsSkipped: number;
  /** Always-empty units enqueued anyway because tonight is their probe night. */
  unitsProbed: number;
}

/**
 * Per-unit archival history for the skip predicate. One grouped read.
 *
 * peakRows spans ALL run kinds deliberately: if a backfill ever proved this
 * unit has data, the unit is proven forever. nightlyObservations counts
 * nightly rows only, because MIN_OBSERVED_NIGHTS is a statement about nightly
 * evidence — a unit whose only 'done' rows came from a backfill has zero
 * nightly observations and therefore fails open.
 *
 * status='done' is the filter, so a unit that has only ever FAILED has no
 * history row at all and fails open too.
 *
 * count() and max() over a bigint column come back from the postgres driver
 * as strings, so both are coerced explicitly — the sql<string> + Number()
 * convention used in src/lib/hours/queries.ts. Drizzle's count() helper does
 * its own .mapWith(Number), but a raw sql`` template does not.
 *
 * The table holds ~1,444 rows today and grows ~60k/year after this change. No
 * index is needed and none is added.
 */
async function loadUnitHistory(): Promise<Map<string, UnitHistory>> {
  const rows = await db
    .select({
      schemaName: redshiftArchiveRuns.schemaName,
      tableName: redshiftArchiveRuns.tableName,
      accountId: redshiftArchiveRuns.accountId,
      nightlyObservations: sql<string>`count(*) filter (where ${redshiftArchiveRuns.runKind} = 'nightly')`,
      peakRows: sql<string>`max(coalesce(${redshiftArchiveRuns.rowsRead}, 0))`,
    })
    .from(redshiftArchiveRuns)
    .where(eq(redshiftArchiveRuns.status, "done"))
    .groupBy(
      redshiftArchiveRuns.schemaName,
      redshiftArchiveRuns.tableName,
      redshiftArchiveRuns.accountId
    );

  const history = new Map<string, UnitHistory>();
  for (const r of rows) {
    history.set(unitHistoryKey(r.schemaName, r.tableName, r.accountId), {
      nightlyObservations: Number(r.nightlyObservations),
      peakRows: Number(r.peakRows),
    });
  }
  return history;
}

export async function runNightlyEnqueue(
  runDate: Date,
  opts: { onlyTable?: string; onlyAccount?: string } = {}
): Promise<EnqueueResult> {
  const catalogRows = await db
    .select({
      schemaName: redshiftArchiveCatalog.schemaName,
      tableName: redshiftArchiveCatalog.tableName,
      tableKind: redshiftArchiveCatalog.tableKind,
      repullWindowDays: redshiftArchiveCatalog.repullWindowDays,
    })
    .from(redshiftArchiveCatalog)
    .where(eq(redshiftArchiveCatalog.enabled, true));

  const scopedCatalogRows = opts.onlyTable
    ? catalogRows.filter((r) => `${r.schemaName}.${r.tableName}` === opts.onlyTable)
    : catalogRows;

  const accountRows = await db
    .select({
      accountId: intentwiseAccounts.accountId,
      clientIdCode: intentwiseAccounts.clientIdCode,
      isActive: intentwiseAccounts.isActive,
    })
    .from(intentwiseAccounts);

  const clientRows = await db
    .select({
      clientIdCode: aac.clientIdCode,
      clientStatus: aac.clientStatus,
      offboardingDate: aac.offboardingDate,
    })
    .from(aac);

  const eligible = selectEligibleAccounts(accountRows, clientRows, runDate);
  const scopedAccounts = opts.onlyAccount ? eligible.filter((a) => a.accountId === opts.onlyAccount) : eligible;

  // The skip is an optimisation, never a correctness dependency. If the
  // history read fails we log loudly and fall back to the full Cartesian
  // fanout — today's behaviour — never to silence. An empty map means every
  // unit reads as "no history", which fails open by construction.
  let history = new Map<string, UnitHistory>();
  try {
    history = await loadUnitHistory();
  } catch (e) {
    console.error(
      "[archive-enqueue] unit-history read failed; falling back to full fanout with no skip:",
      e
    );
  }

  const { units, unitsSkipped, unitsProbed } = buildNightlyWorkUnits(
    scopedCatalogRows.map((r) => ({
      schemaName: r.schemaName,
      tableName: r.tableName,
      tableKind: r.tableKind as "timeseries" | "snapshot" | "period",
      repullWindowDays: r.repullWindowDays,
    })),
    scopedAccounts,
    runDate,
    history
  );

  const runDateStr = formatUtcDate(runDate);
  let inserted = 0;
  if (units.length > 0) {
    const result = await db
      .insert(redshiftArchiveRuns)
      .values(
        units.map((unit) => ({
          runDate: runDateStr,
          runKind: "nightly" as const,
          schemaName: unit.schemaName,
          tableName: unit.tableName,
          accountId: unit.accountId,
          windowFrom: unit.windowFrom,
          windowTo: unit.windowTo,
          status: "pending" as const,
        }))
      )
      .onConflictDoNothing({
        target: [
          redshiftArchiveRuns.runDate,
          redshiftArchiveRuns.runKind,
          redshiftArchiveRuns.schemaName,
          redshiftArchiveRuns.tableName,
          redshiftArchiveRuns.accountId,
        ],
      })
      .returning({ id: redshiftArchiveRuns.id });
    inserted = result.length;
  }

  return {
    runDate: runDateStr,
    enabledTables: scopedCatalogRows.length,
    eligibleAccounts: scopedAccounts.length,
    unitsComputed: units.length,
    unitsInserted: inserted,
    unitsSkipped,
    unitsProbed,
  };
}
