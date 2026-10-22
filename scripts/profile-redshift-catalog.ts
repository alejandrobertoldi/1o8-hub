/* eslint-disable react-doctor/async-await-in-loop */
/**
 * Phase 0 — Redshift catalog discovery and profiling (spec §5).
 *
 * Walks both Redshift schemas, selects every table carrying an account_id
 * column, records its columns and types, classifies its load strategy, and
 * upserts a row into redshift_archive_catalog with enabled = false.
 *
 * Nothing is archived until a human flips `enabled`. A discovered table left
 * disabled is reported as a loud alarm, never a silent skip (spec §5.2).
 *
 * Catalog view note: intentwise_ecommerce_graph holds Spectrum EXTERNAL
 * tables, which do not appear in pg_tables and whose columns are not in
 * information_schema.columns. SVV_COLUMNS covers local and external; if a
 * schema yields nothing there we fall back to SVV_EXTERNAL_COLUMNS.
 *
 * Run: npm run profile-redshift
 */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });

import { queryRedshiftOrThrow } from "../src/lib/redshift";
import {
  toNumber,
  hasAccountIdColumn,
  detectDateColumn,
  classifyTableKind,
  mapRedshiftTypeToBigQuery,
  assertSafeIdentifier,
  sourceRefreshWindowDays,
  columnTypeDrifted,
  type SourceColumn,
} from "../src/lib/archive/catalog";

const SCHEMAS = ["intentwise_ecommerce_graph", "amazon_source_data"] as const;

interface RawColumn {
  table_name: string;
  column_name: string;
  data_type: string;
}

/** SVV_COLUMNS covers local and external tables. */
async function readViaSvvColumns(schema: string): Promise<RawColumn[]> {
  return queryRedshiftOrThrow<RawColumn>(
    `SELECT table_name, column_name, data_type
       FROM svv_columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position`,
    [schema]
  );
}

/** Fallback for Spectrum external schemas. */
async function readViaSvvExternalColumns(schema: string): Promise<RawColumn[]> {
  return queryRedshiftOrThrow<RawColumn>(
    `SELECT tablename AS table_name,
            columnname AS column_name,
            external_type AS data_type
       FROM svv_external_columns
      WHERE schemaname = $1
      ORDER BY tablename, columnnum`,
    [schema]
  );
}

async function readSchemaColumns(schema: string): Promise<{ rows: RawColumn[]; via: string }> {
  const primary = await readViaSvvColumns(schema);
  if (primary.length > 0) return { rows: primary, via: "svv_columns" };
  console.log(`  svv_columns returned nothing for ${schema} — falling back to svv_external_columns`);
  const fallback = await readViaSvvExternalColumns(schema);
  return { rows: fallback, via: "svv_external_columns" };
}

// node-postgres parses Redshift DATE columns into local-midnight Date
// objects, but the Drizzle stats columns are string-mode date() and
// postgres.js crashes serializing a Date where it expects a string. Local
// components, NOT toISOString(): local midnight in a UTC+ zone is the
// previous calendar day in UTC.
function toDateOnlyString(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${v.getFullYear()}-${m}-${d}`;
  }
  return String(v);
}

/**
 * Per (table × account) profiling. This is what settles spec §5.1: if
 * MIN(date_col) is yesterday for every account, retention is rolling and we
 * are losing data daily. If it tracks each account's own start, the
 * warehouse accumulates.
 *
 * Gateway measurements on 2026-07-31 already indicate accumulation
 * (Gaffer 154290 reaches 2020-12-19 with 2050 distinct dates; Halfday
 * 4470600 only 2026-05-30). This pass confirms it against Redshift itself
 * and extends it to every table.
 *
 * Identifiers come from the catalog, which is the allowlist, and are
 * re-validated here. account_id is always a bound parameter (spec §10).
 *
 * Bytes (spec §13.2) are measured at TABLE grain from svv_table_info —
 * Redshift's only byte source, which has no per-account breakdown. Spectrum
 * external tables live in S3 and never appear there; their est_bytes stays
 * NULL and the catalog row's notes are flagged unmeasurable so the Task 8
 * costing sizes them from est_rows instead of misreading NULL as free.
 */
async function profileAccountStats(opts: { onlyTable?: string }) {
  const { db } = await import("../src/lib/db");
  const { redshiftArchiveCatalog, redshiftArchiveAccountStats, intentwiseAccounts } =
    await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const accounts = await db
    .select({ accountId: intentwiseAccounts.accountId })
    .from(intentwiseAccounts)
    .where(eq(intentwiseAccounts.isActive, true));

  if (accounts.length === 0) {
    throw new Error("No active accounts in intentwise_accounts — run seed-intentwise-accounts first.");
  }

  const catalogRows = await db.select().from(redshiftArchiveCatalog);
  const targets = opts.onlyTable
    ? catalogRows.filter((r) => `${r.schemaName}.${r.tableName}` === opts.onlyTable)
    : catalogRows;

  if (targets.length === 0) {
    throw new Error(`No catalog rows matched${opts.onlyTable ? ` --table=${opts.onlyTable}` : ""}.`);
  }

  console.log(`\n=== Stats pass: ${targets.length} table(s) × ${accounts.length} account(s) ===`);

  const incompleteTables: Array<{ table: string; accountIds: string[] }> = [];

  for (const t of targets) {
    const schema = assertSafeIdentifier(t.schemaName);
    const table = assertSafeIdentifier(t.tableName);
    const dateCol = t.dateColumn ? assertSafeIdentifier(t.dateColumn) : null;

    console.log(`\n  ${schema}.${table}  (${t.tableKind})`);

    let tableRows = 0;
    let earliest: string | null = null;
    const failedAccounts: string[] = [];

    for (const a of accounts) {
      const select = dateCol
        ? `SELECT COUNT(*) AS n,
                  MIN(${dateCol}) AS min_date,
                  MAX(${dateCol}) AS max_date,
                  COUNT(DISTINCT ${dateCol}) AS distinct_dates
             FROM ${schema}.${table} WHERE account_id = $1`
        : `SELECT COUNT(*) AS n,
                  NULL AS min_date,
                  NULL AS max_date,
                  NULL AS distinct_dates
             FROM ${schema}.${table} WHERE account_id = $1`;

      let row: { n: unknown; min_date: string | null; max_date: string | null; distinct_dates: unknown };
      try {
        const result = await queryRedshiftOrThrow<typeof row>(select, [a.accountId]);
        row = result[0];
      } catch (e) {
        // Per-account failure must not abort the whole pass, but it must not
        // be silent either: this table's sums are now PARTIAL, so its catalog
        // totals are withheld below and the failure surfaces in the
        // end-of-pass summary for a --table re-run.
        failedAccounts.push(a.accountId);
        console.log(`    ${a.accountId.padEnd(10)} ERROR: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      const rowCount = toNumber(row?.n);
      // Zero rows is a MEASUREMENT, not a skip: a row_count 0 stats row
      // distinguishes "profiled, zero rows" from "never profiled", and lets a
      // re-run overwrite a stale row after an upstream purge (spec §13.4)
      // instead of leaving the old count masking it. min/max/distinct are
      // forced NULL so the row reads as "measured empty on this date".
      const minDate = rowCount === 0 ? null : toDateOnlyString(row.min_date);
      const maxDate = rowCount === 0 ? null : toDateOnlyString(row.max_date);
      const distinctDates =
        rowCount === 0 || row.distinct_dates === null ? null : toNumber(row.distinct_dates);

      tableRows += rowCount;
      if (minDate && (!earliest || minDate < earliest)) earliest = minDate;

      const catalogId = t.id;
      await db
        .insert(redshiftArchiveAccountStats)
        .values({
          catalogId,
          accountId: a.accountId,
          rowCount,
          minDate,
          maxDate,
          distinctDates,
        })
        .onConflictDoUpdate({
          target: [redshiftArchiveAccountStats.catalogId, redshiftArchiveAccountStats.accountId],
          set: {
            rowCount,
            minDate,
            maxDate,
            distinctDates,
            profiledAt: new Date(),
          },
        });

      // A table whose distinct-date count trails its span has gaps AT SOURCE
      // — the §8.3 continuity audit will inherit them. The missing-days
      // arithmetic only holds at day grain (timeseries): a period table
      // (report_week/report_month) legitimately has far fewer distinct dates
      // than days in its span, so it gets coverage printed without a
      // "missing" claim.
      let gapNote = "";
      if (minDate && maxDate && distinctDates !== null) {
        const spanDays =
          Math.round((new Date(maxDate).getTime() - new Date(minDate).getTime()) / 86_400_000) + 1;
        if (t.tableKind === "timeseries") {
          if (spanDays - distinctDates > 0) gapNote = `  ⚠️ ${spanDays - distinctDates} missing day(s)`;
        } else {
          gapNote = `  ${distinctDates} distinct period(s) over ${spanDays}-day span`;
        }
      }

      console.log(
        `    ${a.accountId.padEnd(10)} rows=${rowCount.toLocaleString().padStart(12)}  ` +
        `${minDate ?? "—"} → ${maxDate ?? "—"}${gapNote}`
      );
    }

    // est_bytes (spec §13.2): svv_table_info reports `size` in 1 MB blocks,
    // at table grain — no per-account byte breakdown exists, so this is the
    // whole table including any inactive accounts' rows (an honest upper
    // bound for backfill sizing). Both identifiers are bound parameters.
    let estBytes: number | null = null;
    let bytesNote: string | null = null;
    try {
      const info = await queryRedshiftOrThrow<{ size: unknown }>(
        `SELECT size FROM svv_table_info WHERE "schema" = $1 AND "table" = $2`,
        [t.schemaName, t.tableName]
      );
      if (info.length > 0) {
        estBytes = toNumber(info[0].size) * 1024 * 1024;
      } else {
        bytesNote = "est_bytes unmeasurable: not in svv_table_info (Spectrum external — data lives in S3)";
      }
    } catch (e) {
      bytesNote = `est_bytes unmeasurable: svv_table_info failed (${e instanceof Error ? e.message : String(e)})`;
    }

    // retention_days is MEASURED, never read from documentation (spec §5).
    const retentionDays = earliest
      ? Math.round((Date.now() - new Date(earliest).getTime()) / 86_400_000)
      : null;

    // ≥1 account failure means tableRows/earliest are PARTIAL sums (the 90s
    // query_timeout makes the oldest/largest account the likeliest casualty),
    // so writing them — or refreshing last_profiled_at — would silently
    // understate retention. The catalog totals keep their previous values and
    // the row is flagged incomplete instead. Per-account stats rows upserted
    // above for accounts that SUCCEEDED are individually accurate and stay.
    const incompleteNote = failedAccounts.length
      ? `stats incomplete: ${failedAccounts.length} account failure(s)`
      : null;

    const catalogUpdate: {
      estRows?: number;
      estBytes: number | null;
      retentionDays?: number | null;
      lastProfiledAt?: Date;
      notes?: string;
    } = { estBytes };
    if (!incompleteNote) {
      catalogUpdate.estRows = tableRows;
      catalogUpdate.retentionDays = retentionDays;
      catalogUpdate.lastProfiledAt = new Date();
    }
    const passNotes = [bytesNote, incompleteNote].filter((n): n is string => n !== null);
    if (passNotes.length) {
      // Discovery rewrites notes at the start of every run and this pass runs
      // after it, so the flags survive a full profile run. The includes()
      // guard keeps a repeat from stacking duplicates.
      let merged = t.notes ?? "";
      for (const note of passNotes) {
        merged = !merged ? note : merged.includes(note) ? merged : `${merged}; ${note}`;
      }
      catalogUpdate.notes = merged;
    }

    await db
      .update(redshiftArchiveCatalog)
      .set(catalogUpdate)
      .where(eq(redshiftArchiveCatalog.id, t.id));

    if (failedAccounts.length) {
      incompleteTables.push({ table: `${schema}.${table}`, accountIds: failedAccounts });
    }

    console.log(
      `    → total rows ${tableRows.toLocaleString()}, measured retention ${retentionDays ?? "unknown"} days, ` +
      `est_bytes ${estBytes === null ? "unmeasurable" : estBytes.toLocaleString()}` +
      (failedAccounts.length
        ? `  ⚠️ INCOMPLETE (${failedAccounts.length} account failure(s) — catalog totals NOT updated)`
        : "")
    );
  }

  // Incomplete tables must be visible at the end, not buried in scroll: list
  // each with its failed account_ids so a human can re-run just that table.
  if (incompleteTables.length) {
    console.log(
      `\n⚠️  ${incompleteTables.length} table(s) had incomplete stats — est_rows/retention_days/last_profiled_at NOT updated:`
    );
    for (const it of incompleteTables) {
      console.log(`     ${it.table} — failed account(s): ${it.accountIds.join(", ")}`);
    }
    console.log(`   Re-run per table: npm run profile-redshift -- --stats --table=<schema>.<table>`);
  }
}

async function main() {
  const { db } = await import("../src/lib/db");
  const { redshiftArchiveCatalog } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");

  let totalTables = 0;
  let withAccountId = 0;
  const skipped: string[] = [];

  const existingRows = await db.select().from(redshiftArchiveCatalog);
  const existingByKey = new Map(existingRows.map((r) => [`${r.schemaName}.${r.tableName}`, r]));

  for (const schema of SCHEMAS) {
    assertSafeIdentifier(schema);
    console.log(`\n=== ${schema} ===`);

    const { rows, via } = await readSchemaColumns(schema);
    if (rows.length === 0) {
      console.log(`  ⚠️  NO COLUMNS FOUND for ${schema} via either catalog view.`);
      console.log(`      This is a hard problem, not an empty schema — investigate before continuing.`);
      continue;
    }
    console.log(`  Read ${rows.length} column rows via ${via}`);

    // Group columns by table.
    const byTable = new Map<string, SourceColumn[]>();
    for (const r of rows) {
      const list = byTable.get(r.table_name) ?? [];
      list.push({ name: r.column_name, type: r.data_type });
      byTable.set(r.table_name, list);
    }
    totalTables += byTable.size;
    console.log(`  ${byTable.size} tables`);

    for (const [tableName, columns] of [...byTable.entries()].sort()) {
      if (!hasAccountIdColumn(columns)) {
        skipped.push(`${schema}.${tableName}`);
        continue;
      }
      assertSafeIdentifier(tableName);
      withAccountId++;

      const dateColumn = detectDateColumn(columns);
      const tableKind = classifyTableKind(dateColumn);

      const mappedColumns = columns.map((c) => {
        const { bqType, mapped } = mapRedshiftTypeToBigQuery(c.type);
        return { name: c.name, type: c.type, bqType, mapped };
      });
      const unmapped = mappedColumns.filter((c) => !c.mapped);
      const existing = existingByKey.get(`${schema}.${tableName}`);
      const priorColumns =
        (existing?.columns as Array<{ name: string; type: string; bqType: string }> | null) ?? [];
      const priorByName = new Map(priorColumns.map((c) => [c.name.toLowerCase(), c]));
      const typeDrift = mappedColumns.filter((c) => {
        const prior = priorByName.get(c.name.toLowerCase());
        return prior !== undefined && columnTypeDrifted(prior, c);
      });
      // Show the raw Redshift types, not the bq types: a NUMERIC precision
      // change or a naive<->tz TIMESTAMP change is exactly the case where
      // the bqType is IDENTICAL on both sides, so a bqType-only note would
      // read as "no change" for the very drift it's reporting.
      const driftNote = typeDrift.length
        ? `SCHEMA DRIFT: column type change blocks archival — ${typeDrift
            .map((c) => `${c.name} ${priorByName.get(c.name.toLowerCase())?.type}→${c.type}`)
            .join(", ")}`
        : null;
      const unmappedNote = unmapped.length
        ? `Unmapped source types fell back to STRING: ${unmapped.map((c) => `${c.name}:${c.type}`).join(", ")}`
        : null;
      const notes = [driftNote, unmappedNote].filter((n): n is string => n !== null).join("; ") || null;

      await db
        .insert(redshiftArchiveCatalog)
        .values({
          schemaName: schema,
          tableName,
          tableKind,
          dateColumn,
          sourceRefreshWindowDays: sourceRefreshWindowDays(tableName),
          repullWindowDays: 14,
          enabled: false,
          columns: mappedColumns,
          lastProfiledAt: new Date(),
          notes,
        })
        .onConflictDoUpdate({
          target: [redshiftArchiveCatalog.schemaName, redshiftArchiveCatalog.tableName],
          // Never overwrite the human-set enabled flag or a hand-tuned
          // repull window — EXCEPT on type drift below, which force-disables
          // regardless of what a human had set. first_seen_at is preserved
          // by omission.
          set: {
            tableKind,
            dateColumn,
            sourceRefreshWindowDays: sourceRefreshWindowDays(tableName),
            // A type change on a column BLOCKS archival until a human
            // reviews it (spec section 6) — force-disable rather than
            // preserving whatever a human had previously set.
            ...(typeDrift.length ? { enabled: false } : {}),
            columns: mappedColumns,
            lastProfiledAt: new Date(),
            notes,
          },
        });

      if (typeDrift.length) {
        console.log(`    ⚠️  ${tableName}: SCHEMA DRIFT — table force-disabled: ${driftNote}`);
      }

      console.log(
        `    ${tableName.padEnd(52)} ${tableKind.padEnd(11)} ` +
        `date=${(dateColumn ?? "—").padEnd(14)} cols=${String(columns.length).padStart(3)}` +
        (unmapped.length ? `  ⚠️ ${unmapped.length} unmapped type(s)` : "")
      );
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Tables scanned:            ${totalTables}`);
  console.log(`  Carrying account_id:       ${withAccountId}  → catalogued, enabled = false`);
  console.log(`  Without account_id:        ${skipped.length}  → not archivable per-client`);

  // Spec §5.2: a discovered-but-disabled table is a loud alarm.
  const disabled = await db.execute(sql`
    SELECT schema_name, table_name FROM redshift_archive_catalog
    WHERE enabled = false ORDER BY schema_name, table_name
  `);
  const disabledRows = disabled as unknown as Array<{ schema_name: string; table_name: string }>;
  if (disabledRows.length) {
    console.log(`\n⚠️  ${disabledRows.length} catalogued table(s) are DISABLED and will NOT be archived:`);
    for (const r of disabledRows) console.log(`     ${r.schema_name}.${r.table_name}`);
    console.log(`   Review each, then: UPDATE redshift_archive_catalog SET enabled = true WHERE ...;`);
  }

  const args = process.argv.slice(2);
  const wantStats = args.includes("--stats");
  const tableArg = args.find((a) => a.startsWith("--table="));
  const onlyTable = tableArg ? tableArg.slice("--table=".length) : undefined;

  if (wantStats) {
    await profileAccountStats({ onlyTable });
  } else {
    console.log(`\nDiscovery only. Re-run with --stats to measure retention and size the backfill.`);
    console.log(`  npm run profile-redshift -- --stats`);
    console.log(`  npm run profile-redshift -- --stats --table=intentwise_ecommerce_graph.account_summary`);
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
