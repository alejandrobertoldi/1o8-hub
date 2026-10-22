/**
 * BigQuery archive layer (spec §6).
 *
 * Dataset mfhub-501815.intentwise_archive, one table per source table named
 * "{schema}__{table}", partitioned DAY on the source date column (or on
 * _archived_at for snapshot tables), clustered on account_id.
 *
 * New-column drift is admitted here by comparing the staging schema against
 * the live target schema and merging (see the plan's Deviation 1 — this is
 * NOT the load-job ALLOW_FIELD_ADDITION flag, because the destination write
 * is a DML transaction, not a load job with a destination table).
 *
 * Type-change drift is NOT handled here — it is caught at discovery time in
 * scripts/profile-redshift-catalog.ts (Deviation 2), which disables the
 * table before this module would ever see a work unit for it again.
 */
import { Readable } from "stream";
import { BigQuery } from "@google-cloud/bigquery";
import { getBigQueryClient } from "@/lib/bigquery";
import { assertSafeIdentifier, timestampIsTzAware, type TableKind } from "@/lib/archive/catalog";
import { queryRedshiftOrThrow } from "@/lib/redshift";

const PROJECT_ID = process.env.GCP_PROJECT_ID || "mfhub-501815";
export const ARCHIVE_DATASET = process.env.BQ_ARCHIVE_DATASET || "intentwise_archive";
const ARCHIVE_LOCATION = process.env.BQ_ARCHIVE_LOCATION || "US";

// The archive dataset, once created, is never deleted by this app — re-checking
// dataset.exists() on every one of ~780 nightly work units is pure waste.
// Module-scoped so it also survives across invocations on a warm Vercel
// instance; process death (cold start) simply re-checks once, which is fine.
let datasetEnsured = false;

export interface ArchiveColumn {
  name: string;
  bqType: string;
  /**
   * The RAW Redshift type, e.g. "timestamp without time zone". Required by
   * toBqJsonValue, which cannot correctly serialise a TIMESTAMP from bqType
   * alone. Optional on the interface only so the many fixtures and callers
   * that never reach the value mapper (buildTableSchema, findColumnBqType)
   * stay valid; the profiler persists it for every catalogued column.
   */
  type?: string;
}

export interface CatalogRowForArchive {
  schemaName: string;
  tableName: string;
  tableKind: TableKind;
  dateColumn: string | null;
  columns: ArchiveColumn[];
}

export function archiveTableId(schemaName: string, tableName: string): string {
  return `${schemaName}__${tableName}`;
}

export function findColumnBqType(columns: ArchiveColumn[], name: string): string | null {
  const hit = columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return hit ? hit.bqType : null;
}

/** Every archive table gets one extra column beyond its source columns. */
export function buildTableSchema(columns: ArchiveColumn[]): Array<{ name: string; type: string }> {
  return [...columns.map((c) => ({ name: c.name, type: c.bqType })), { name: "_archived_at", type: "TIMESTAMP" }];
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** YYYY-MM-DD from a Date's LOCAL components. */
function localDateOnly(value: Date): string {
  return `${pad(value.getFullYear(), 4)}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** YYYY-MM-DD HH:MM:SS.mmm from a Date's LOCAL components, with no zone. */
function localDateTime(value: Date): string {
  return (
    `${localDateOnly(value)} ` +
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(value.getMilliseconds(), 3)}`
  );
}

/**
 * Convert one Redshift driver value into what must appear in the NDJSON handed
 * to BigQuery.
 *
 * WHY THIS EXISTS: src/lib/redshift.ts installs no `pg` type parsers, so
 * pg-types' defaults apply and `date`, `timestamp` and `timestamptz` all
 * arrive as JavaScript Dates. `JSON.stringify` serialises a Date via
 * toISOString(), which silently rewrites naive source values by the PROCESS
 * timezone: on a UTC+2 host, `date '2026-08-03'` shipped as
 * "2026-08-02T22:00:00.000Z" — a calendar day early, in the system of record.
 * Everything else (numeric/int8 as strings, nulls, numbers, booleans, JSON)
 * already serialises correctly and is passed through untouched.
 *
 * The RAW Redshift type is required, not just bqType: TYPE_MAP collapses all
 * four TIMESTAMP spellings onto a bare TIMESTAMP (catalog.ts), but naive and
 * tz-aware need opposite handling — a tz-aware Date is already a correct
 * absolute instant, and reading its local components would corrupt a value
 * that is currently right.
 *
 * Locked semantic (Manu, 2026-08-03): a naive source timestamp preserves its
 * source DIGITS and is labelled UTC — '2026-08-03 12:34:56' at source lands
 * as 12:34:56 UTC in BigQuery. The archive must show exactly the digits
 * Redshift showed, and a value must never depend on whether the job ran on
 * Vercel or on a laptop. (The rejected alternative was remapping naive
 * timestamps to BigQuery DATETIME, which would change bqType for all 214
 * already-profiled catalog rows and trip the drift guard on re-profile.)
 *
 * The DATE branch is the same local-components rule as toDateOnlyString in
 * scripts/profile-redshift-catalog.ts:81-89 — the two are one fix applied on
 * opposite sides of the pipeline, and are meant to be found together.
 */
export function toBqJsonValue(value: unknown, bqType: string | null, rawType: string | null): unknown {
  if (!(value instanceof Date)) return value;
  if (bqType === "DATE") return localDateOnly(value);
  // Not emitted by TYPE_MAP today — defensive, so a future DATETIME mapping
  // does not silently fall through to the toISOString branch below.
  if (bqType === "DATETIME") return localDateTime(value);
  if (bqType === "TIMESTAMP") {
    const tzAware = timestampIsTzAware(rawType);
    if (tzAware === true) return value.toISOString();
    if (tzAware === false) return localDateTime(value);
    // Unreachable in normal operation (every TIMESTAMP bqType comes from a
    // recognised spelling) and deliberately a tripwire rather than a default:
    // either default would be wrong by exactly the host's UTC offset for the
    // other case, silently reintroducing the bug this function exists to fix.
    throw new Error(
      `toBqJsonValue: a Date on a BigQuery TIMESTAMP column needs a recognised Redshift timestamp type to know whether it is naive or tz-aware, got ${JSON.stringify(rawType)}`
    );
  }
  return value.toISOString();
}

export function partitioningFor(
  tableKind: TableKind,
  dateColumn: string | null
): { field: string; type: "DAY" } {
  if (tableKind === "snapshot") return { field: "_archived_at", type: "DAY" };
  if (!dateColumn) throw new Error(`partitioningFor: ${tableKind} table has no date column`);
  return { field: dateColumn, type: "DAY" };
}

/**
 * The INSERT names its columns explicitly and selects that same name list
 * from staging — it never uses `SELECT *`. `ensureArchiveTable` only ever
 * ADDS columns to the target and never removes them, while the staging
 * schema is rebuilt from the catalog's CURRENT columns on every call. Once a
 * source column is dropped, staging permanently has fewer columns than the
 * target, so a positional `SELECT *` would break the transaction forever the
 * next time that table is loaded. Naming columns explicitly instead leaves
 * the target's extra (retired) columns as NULL on newly inserted rows —
 * exactly the "stops receiving new values" behavior `ensureArchiveTable`'s
 * docstring promises.
 */
export function buildTransactionSql(params: {
  targetTable: string;
  stagingTable: string;
  tableKind: TableKind;
  dateColumnBqName: string | null;
  dateColumnBqType: string | null;
  columnNames: string[];
  /**
   * False for a work unit that read ZERO rows from Redshift: emit the DELETE
   * alone and never mention the staging table. See loadWorkUnit — nothing is
   * staged in that case, so an INSERT ... FROM staging would re-insert
   * whichever account's rows happen to still be sitting there.
   */
  includeInsert?: boolean;
}): string {
  const { targetTable, stagingTable, tableKind, dateColumnBqName, dateColumnBqType, columnNames } = params;
  const includeInsert = params.includeInsert ?? true;
  const columnList = columnNames.map((c) => `\`${c}\``).join(", ");
  const insert = `INSERT INTO \`${targetTable}\` (${columnList}) SELECT ${columnList} FROM \`${stagingTable}\`;`;
  // BEGIN TRANSACTION / COMMIT TRANSACTION, not a bare BEGIN/COMMIT: BigQuery
  // parses a bare BEGIN as opening a block statement (which needs a matching
  // END;), not as starting a transaction. Without the TRANSACTION keyword the
  // parser stays inside the open block waiting for END and dies at end of
  // script instead — found live in Task 7's first real drain (a BigQuery
  // "Unexpected end of script" error), unconditionally, on every branch.
  const body = (del: string) =>
    includeInsert
      ? `BEGIN TRANSACTION;\n  ${del}\n  ${insert}\nCOMMIT TRANSACTION;`
      : `BEGIN TRANSACTION;\n  ${del}\nCOMMIT TRANSACTION;`;

  if (tableKind === "snapshot") {
    // Scoped to (this account, this archival day) — NOT insert-only. The queue
    // can legitimately replay a unit whose BigQuery transaction already
    // committed (a process death before the Postgres status='done' write, then
    // reclaimStaleRuns sweeping it back to pending), and an insert-only
    // snapshot branch duplicated the entire snapshot when that happened.
    // Per-DAY snapshot history is untouched; only a same-day retry is now
    // idempotent, making the snapshot branch symmetric with the one below.
    const del =
      `DELETE FROM \`${targetTable}\` ` +
      `WHERE CAST(account_id AS STRING) = @accountId AND DATE(\`_archived_at\`) = @archivedDate;`;
    return body(del);
  }
  if (!dateColumnBqName || !dateColumnBqType) {
    throw new Error(`buildTransactionSql: ${targetTable} is ${tableKind} but is missing its date column info`);
  }
  const dateExpr = dateColumnBqType === "TIMESTAMP" ? `DATE(\`${dateColumnBqName}\`)` : `\`${dateColumnBqName}\``;
  const del =
    `DELETE FROM \`${targetTable}\` ` +
    `WHERE CAST(account_id AS STRING) = @accountId AND ${dateExpr} BETWEEN @windowFrom AND @windowTo;`;
  return body(del);
}

/**
 * The Redshift read for one work unit.
 *
 * Names the catalog's columns explicitly instead of `SELECT *`. With `SELECT *`
 * the read returned the LIVE source shape while the BigQuery staging schema
 * came from the last discovery snapshot, and the load job sets neither
 * ignoreUnknownValues nor maxBadRecords — so a single source ADD COLUMN made
 * every nightly unit for that table fail, burn all 3 attempts and go terminal,
 * every night, until somebody remembered to re-run the (manual) profiler. A
 * not-yet-admitted column is now simply not read until discovery admits it:
 * same data outcome, no failure, narrower read, and symmetric with the
 * name-matched INSERT on the write side.
 *
 * It also makes every row key guaranteed to have a catalog entry, which is
 * what lets toBqJsonValue's per-column type lookup never silently miss.
 *
 * Column names are bare and unquoted, matching the existing `${schema}.${table}`
 * style; the caller passes them through assertSafeIdentifier BEFORE this runs.
 */
export function buildSourceSelectSql(params: {
  schema: string;
  table: string;
  tableKind: TableKind;
  dateColumn: string | null;
  /**
   * True when the date column is a Redshift timestamp/timestamptz. Redshift
   * casts a date-string BETWEEN bound to midnight, so an un-truncated
   * timestamp comparison excludes nearly all of the upper bound's calendar
   * day — while buildTransactionSql's BigQuery DELETE truncates with DATE()
   * and so covers that whole day. Truncating here too keeps the read and the
   * delete scoped to the exact same calendar-day range. DATE columns need no
   * truncation — they're already whole-day values on both sides.
   */
  dateColumnIsTimestamp: boolean;
  /** Source columns only — never _archived_at, which exists in BigQuery alone. */
  columnNames: string[];
}): string {
  const { schema, table, tableKind, dateColumn, dateColumnIsTimestamp, columnNames } = params;
  if (columnNames.length === 0) {
    throw new Error(
      `buildSourceSelectSql: ${schema}.${table} has no columns in the catalog — refusing to emit malformed SQL`
    );
  }
  const columnList = columnNames.join(", ");
  if (tableKind === "snapshot") {
    return `SELECT ${columnList} FROM ${schema}.${table} WHERE account_id = $1`;
  }
  if (!dateColumn) {
    throw new Error(`buildSourceSelectSql: ${schema}.${table} is ${tableKind} but has no date column`);
  }
  const dateExpr = dateColumnIsTimestamp ? `DATE(${dateColumn})` : dateColumn;
  return (
    `SELECT ${columnList} FROM ${schema}.${table} ` +
    `WHERE account_id = $1 AND ${dateExpr} BETWEEN $2 AND $3`
  );
}

/**
 * Serialise a mapped batch to NEWLINE_DELIMITED_JSON one line at a time.
 *
 * This is a generator, not a string, on purpose. The build it replaced was
 * `stampedRows.map(JSON.stringify).join("\n")`, which held FOUR full copies of
 * the work unit alive at once — pg's buffered rows, the mapped objects, the
 * array of serialised strings, and the single joined string — and only then
 * began the upload. Measured on the heaviest live share_of_voice unit
 * (231,328 rows / 126 MB of payload): that cost **+259 MB** of heap over the
 * mapped batch, against a Vercel default function budget of 1769 MB, and it
 * scales linearly with the unit — so a wider backfill window on a table of
 * this shape would run out of memory rather than merely being wasteful.
 *
 * Yielding line-by-line costs **+14 MB** for the same payload and is also 27%
 * FASTER end-to-end (12.5 s vs 17.1 s), because BigQuery starts receiving
 * while we are still serialising instead of waiting for the join to finish.
 *
 * Note the trailing newline on every line, including the last — the `join`
 * left the final row unterminated. Both forms are valid NDJSON; this one was
 * verified live, landing exactly 231,328 of 231,328 rows.
 */
export function* ndjsonLines(rows: Record<string, unknown>[]): Generator<string> {
  for (const row of rows) yield `${JSON.stringify(row)}\n`;
}

/**
 * Create the archive dataset/table on first sight; on later calls, admit any
 * new source column the catalog now knows about that the live BigQuery table
 * doesn't have yet. Never removes or retypes an existing column — a dropped
 * source column is retained and simply stops receiving new values (spec §6).
 */
export async function ensureArchiveTable(
  catalogRow: CatalogRowForArchive
): Promise<{ created: boolean; addedColumns: string[] }> {
  const bigquery = getBigQueryClient();
  const dataset = bigquery.dataset(ARCHIVE_DATASET);
  if (!datasetEnsured) {
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) await dataset.create({ location: ARCHIVE_LOCATION });
    datasetEnsured = true;
  }

  const tableId = archiveTableId(catalogRow.schemaName, catalogRow.tableName);
  const table = dataset.table(tableId);
  const [tableExists] = await table.exists();
  const desiredFields = buildTableSchema(catalogRow.columns);
  const partitioning = partitioningFor(catalogRow.tableKind, catalogRow.dateColumn);

  if (!tableExists) {
    await table.create({
      schema: { fields: desiredFields },
      timePartitioning: { type: partitioning.type, field: partitioning.field },
      clustering: { fields: ["account_id"] },
    });
    return { created: true, addedColumns: [] };
  }

  const [metadata] = await table.getMetadata();
  const existingNames = new Set(
    ((metadata.schema?.fields ?? []) as Array<{ name: string }>).map((f) => f.name.toLowerCase())
  );
  const newFields = desiredFields.filter((f) => !existingNames.has(f.name.toLowerCase()));
  if (newFields.length) {
    const mergedFields = [...(metadata.schema?.fields ?? []), ...newFields];
    await table.setMetadata({ schema: { fields: mergedFields } });
  }
  return { created: false, addedColumns: newFields.map((f) => f.name) };
}

/**
 * A null archival window on a non-snapshot table would let the Redshift
 * `BETWEEN $2 AND $3` and the BigQuery `BETWEEN @windowFrom AND @windowTo`
 * both evaluate to SQL UNKNOWN: zero rows read, zero written, the DELETE
 * matches nothing, and nothing throws — the queue row would record a clean
 * "done" with rows_written=0, silently archiving nothing. This throws
 * instead of defaulting, matching partitioningFor/buildTransactionSql's
 * existing "throw rather than paper over a missing date input" posture.
 */
export function assertWindowPresent(
  tableKind: TableKind,
  windowFrom: string | null,
  windowTo: string | null
): void {
  if (tableKind === "snapshot") return;
  if (!windowFrom || !windowTo) {
    throw new Error(
      `assertWindowPresent: ${tableKind} table requires both windowFrom and windowTo, got windowFrom=${JSON.stringify(windowFrom)}, windowTo=${JSON.stringify(windowTo)}`
    );
  }
}

/**
 * The bound query parameters for one work unit's BigQuery write transaction.
 *
 * EVERY DATE param goes through BigQuery.date(). A plain JS string with a
 * `types: { x: "DATE" }` hint does NOT serialise to a DATE — the client sends
 * NULL, silently, and every comparison against it is SQL UNKNOWN. That made the
 * DELETE half of buildTransactionSql match zero rows on EVERY write, for every
 * table, since the feature was built: the intended delete-then-insert overwrite
 * had always been insert-only, so any replay of an already-committed unit
 * (reclaimStaleRuns sweeping a crashed-after-commit unit back to pending)
 * duplicated that account's rows instead of replacing them. Found live in Task 7
 * v2 Part C2 — ad_portfolio/272970 went 1 row -> 2 on a forced same-day retry.
 *
 * This lives in its own exported function for ONE reason: the bug sat inside a
 * `createQueryJob` argument object, where no unit test could reach it. A test
 * asserting the built params here is the only regression guard that does not
 * need a mocked BigQuery client. It is a pure function over strings, matching
 * this module's other exported builders.
 *
 * The window bounds are re-checked here rather than cast with `as string`.
 * assertWindowPresent returns void and so narrows nothing, and a cast would let
 * a null bound become BigQueryDate{value: undefined} — serialising back to the
 * very NULL this function exists to prevent, one layer up from the original bug.
 */
export function buildWriteQueryParams(input: {
  tableKind: TableKind;
  accountId: string;
  archivedDate: string;
  windowFrom: string | null;
  windowTo: string | null;
}): { params: Record<string, unknown>; types: Record<string, string> } {
  const { tableKind, accountId, archivedDate, windowFrom, windowTo } = input;
  if (tableKind === "snapshot") {
    return {
      params: { accountId, archivedDate: BigQuery.date(archivedDate) },
      types: { accountId: "STRING", archivedDate: "DATE" },
    };
  }
  if (!windowFrom || !windowTo) {
    throw new Error(
      `buildWriteQueryParams: ${tableKind} table requires both windowFrom and windowTo, got windowFrom=${JSON.stringify(windowFrom)}, windowTo=${JSON.stringify(windowTo)}`
    );
  }
  return {
    params: {
      accountId,
      windowFrom: BigQuery.date(windowFrom),
      windowTo: BigQuery.date(windowTo),
    },
    types: { accountId: "STRING", windowFrom: "DATE", windowTo: "DATE" },
  };
}

/**
 * Pull one (table x account x window) work unit from Redshift and commit it
 * into BigQuery. Sequential by design (Deviation 3) — the staging table name
 * is fixed per source table, so two units for the same table must never run
 * concurrently.
 */
export async function loadWorkUnit(params: {
  catalogRow: CatalogRowForArchive;
  accountId: string;
  windowFrom: string | null;
  windowTo: string | null;
  archivedAt: Date;
}): Promise<{ rowsRead: number; rowsWritten: number }> {
  const { catalogRow, accountId, windowFrom, windowTo, archivedAt } = params;
  assertWindowPresent(catalogRow.tableKind, windowFrom, windowTo);
  const schema = assertSafeIdentifier(catalogRow.schemaName);
  const table = assertSafeIdentifier(catalogRow.tableName);
  const dateColumn = catalogRow.dateColumn ? assertSafeIdentifier(catalogRow.dateColumn) : null;

  const isSnapshot = catalogRow.tableKind === "snapshot";
  const schemaFields = buildTableSchema(catalogRow.columns);
  // Column names are interpolated into raw SQL column lists on BOTH sides now
  // — the Redshift SELECT list below and the BigQuery list in
  // buildTransactionSql — so they are validated BEFORE the read reaches
  // Redshift, not after it. Same belt-and-suspenders posture already applied
  // to schema, table and dateColumn above.
  const sourceColumnNames = catalogRow.columns.map((c) => assertSafeIdentifier(c.name));
  const columnNames = schemaFields.map((f) => assertSafeIdentifier(f.name));

  const dateColBqType = dateColumn ? findColumnBqType(catalogRow.columns, dateColumn) : null;
  const selectSql = buildSourceSelectSql({
    schema,
    table,
    tableKind: catalogRow.tableKind,
    dateColumn,
    dateColumnIsTimestamp: dateColBqType === "TIMESTAMP",
    columnNames: sourceColumnNames,
  });
  const selectParams = isSnapshot ? [accountId] : [accountId, windowFrom, windowTo];
  const rows = await queryRedshiftOrThrow<Record<string, unknown>>(selectSql, selectParams);

  const { addedColumns } = await ensureArchiveTable(catalogRow);
  if (addedColumns.length) {
    console.log(`[archive] ${schema}.${table}: admitted new column(s) ${addedColumns.join(", ")}`);
  }

  const archivedAtIso = archivedAt.toISOString();
  // Built once for the whole batch, not per value.
  const byName = new Map(
    catalogRow.columns.map((c) => [c.name.toLowerCase(), { bqType: c.bqType, type: c.type ?? null }])
  );
  const stampedRows = rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      const col = byName.get(k.toLowerCase());
      out[k] = toBqJsonValue(v, col?.bqType ?? null, col?.type ?? null);
    }
    // Stamped AFTER the source values are mapped, and deliberately not routed
    // through toBqJsonValue: it is already an ISO string, and it is absent
    // from catalogRow.columns, so mapping it would hit the TIMESTAMP-with-
    // unknown-rawType throw.
    out._archived_at = archivedAtIso;
    return out;
  });

  const bigquery = getBigQueryClient();
  const dataset = bigquery.dataset(ARCHIVE_DATASET);
  const targetId = archiveTableId(schema, table);
  const stagingId = `_stg_${targetId}`;
  const hasRows = stampedRows.length > 0;

  // Zero rows is the steady-state common case, not an edge case: 52 accounts x
  // 15 tables, and most accounts have no rows in most tables. It used to stage
  // an empty load and DEPEND on WRITE_TRUNCATE emptying the shared staging
  // table — an unverified assumption whose failure mode is silent duplication
  // of the PREVIOUS account's rows under this account's transaction. Skipping
  // the staging load entirely and emitting a DELETE-only transaction removes
  // the dependency rather than trusting it: a window now empty at the source
  // becomes empty in the archive. ensureArchiveTable above still runs — the
  // DELETE needs its target to exist.
  if (hasRows) {
    const stagingTable = dataset.table(stagingId);
    const [stagingExists] = await stagingTable.exists();
    if (!stagingExists) await dataset.createTable(stagingId, { schema: { fields: schemaFields } });

    await new Promise<void>((resolve, reject) => {
      const writeStream = stagingTable.createWriteStream({
        sourceFormat: "NEWLINE_DELIMITED_JSON",
        writeDisposition: "WRITE_TRUNCATE",
        schema: { fields: schemaFields },
      });
      writeStream.on("complete", () => resolve());
      writeStream.on("error", reject);
      Readable.from(ndjsonLines(stampedRows)).pipe(writeStream);
    });
  }

  const txnSql = buildTransactionSql({
    targetTable: `${PROJECT_ID}.${ARCHIVE_DATASET}.${targetId}`,
    stagingTable: `${PROJECT_ID}.${ARCHIVE_DATASET}.${stagingId}`,
    tableKind: catalogRow.tableKind,
    dateColumnBqName: dateColumn,
    dateColumnBqType: dateColBqType,
    columnNames,
    includeInsert: hasRows,
  });

  // UTC, not local components — the opposite of toBqJsonValue's rule and
  // deliberately so. _archived_at is stamped as archivedAt.toISOString(), and
  // BigQuery's DATE(_archived_at) evaluates in UTC, so the bound @archivedDate
  // must be the UTC calendar day of the very same instant the rows carry.
  const archivedDate = archivedAtIso.slice(0, 10);

  // See buildWriteQueryParams — a DATE param that is not wrapped serialises to
  // NULL and silently turns this transaction's DELETE into a no-op.
  const { params: queryParams, types: queryTypes } = buildWriteQueryParams({
    tableKind: catalogRow.tableKind,
    accountId,
    archivedDate,
    windowFrom,
    windowTo,
  });
  const [job] = await bigquery.createQueryJob({
    query: txnSql,
    params: queryParams,
    types: queryTypes,
  });
  await job.getQueryResults();

  return { rowsRead: rows.length, rowsWritten: stampedRows.length };
}
