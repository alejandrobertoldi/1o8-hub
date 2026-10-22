/**
 * Pure catalog logic for Redshift → BigQuery archival.
 *
 * No I/O lives here — the scripts in scripts/ do the querying and call
 * into these functions. That keeps every classification decision unit
 * testable without a live cluster.
 */

/**
 * Coerce a Redshift driver value to a number.
 *
 * `SELECT COUNT(*) AS c` comes back as a STRING through this `pg` +
 * Redshift combination (see scripts/discover-monthly-redshift-schema.ts:12).
 * Truthiness checks give false positives and `"500" === 500` is false, so
 * every count crossing the wire goes through here. Throws rather than
 * returning NaN: a silently-NaN row count would make a parity check pass.
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Value is not numeric: ${value}`);
    return value;
  }
  if (typeof value === "string" || typeof value === "bigint") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`Value is not numeric: ${String(value)}`);
    return n;
  }
  throw new Error(`Value is not numeric: ${JSON.stringify(value)}`);
}

export type TableKind = "timeseries" | "snapshot" | "period";

export interface SourceColumn {
  name: string;
  type: string;
}

/** The one filter key both Redshift schemas share (spec §3.1). */
export const ACCOUNT_ID_COLUMN = "account_id";

export function hasAccountIdColumn(columns: SourceColumn[]): boolean {
  return columns.some((c) => c.name.toLowerCase() === ACCOUNT_ID_COLUMN);
}

/**
 * Date columns that represent a table's REPORT GRAIN, most specific first.
 *
 * Deliberately excludes start_date/end_date: on campaign-shaped tables those
 * are structure attributes of the row, not the time axis of the table, and
 * partitioning on them would be wrong.
 */
export const DATE_COLUMN_PRIORITY = [
  "report_date",
  // Same grain as report_date, spelled without the separator. The Sponsored
  // Ads and DSP report tables use this form exclusively; while it was missing
  // here, eight of them fell through to the type fallback, tied against their
  // own start/end date columns, and classified as snapshots.
  "reportdate",
  "report_week",
  "report_month",
  "snapshot_date",
  // The grain of the sellercentral_salesandtraffic* family.
  "sale_date",
  "date",
] as const;

/**
 * Base types that are timezone-aware, under either spelling.
 *
 * INVARIANT: every TIMESTAMP spelling in TYPE_MAP must appear in exactly one
 * of TZ_AWARE_BASE_TYPES / NAIVE_TIMESTAMP_BASE_TYPES. A fifth spelling added
 * to TYPE_MAP without an entry here would silently canonicalise as naive, so
 * columnTypeDrifted would stop detecting a real naive<->aware change on it —
 * the guard failing quietly in the one bucket it exists for.
 */
const TZ_AWARE_BASE_TYPES = new Set(["timestamptz", "timestamp with time zone"]);

/**
 * Base types that carry no zone, under either spelling. Same invariant as
 * TZ_AWARE_BASE_TYPES above: TYPE_MAP's TIMESTAMP spellings are partitioned
 * across exactly these two sets, and both timestampIsTzAware and
 * canonicalLossyType read them so the two cannot drift apart.
 */
const NAIVE_TIMESTAMP_BASE_TYPES = new Set(["timestamp", "timestamp without time zone"]);

/**
 * Types that can carry a table's time axis, in tiers — a whole DATE day is
 * tried before any instant, and only a tier that yields exactly ONE candidate
 * decides (see detectDateColumn).
 *
 * The tiering is load-bearing, not cosmetic. The instant tier used to be
 * invisible: baseType() strips parameters but not trailing words, so
 * SVV_COLUMNS' "timestamp without time zone" — the spelling every NATIVE
 * Redshift table reports — never matched a hand-written {"timestamp"} set, and
 * a table whose only time axis was a native timestamp classified as a
 * snapshot. But simply widening one flat set makes it WORSE: measured against
 * the live 220-row catalog, 33 tables are timeseries today only because their
 * timestamp columns were invisible, leaving a lone DATE (download_date,
 * created_date, effective_date) to win by default. Widening flat ties their
 * vote and drops all 33 to snapshot — a full un-chunked per-account table read
 * every night, the exact cost this classification exists to avoid.
 *
 * Tier 1 is DATE alone. A DATE column is a day grain by construction; a
 * TIMESTAMP is more often an event or row-mutation instant, which is a worse
 * partition key. Every one of the 51 rows whose classification moves has a
 * base-`date` candidate or none at all, so the tier boundary is exactly where
 * the real signal is.
 *
 * Tier 2 is DERIVED from the two TIMESTAMP spelling sets rather than listed,
 * which extends their invariant here: a spelling added to TYPE_MAP and its
 * awareness set reaches date detection automatically, instead of going
 * quietly missing the way "timestamp without time zone" did.
 */
const DATE_GRAIN_TYPE_TIERS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["date"]),
  new Set(["datetime", ...TZ_AWARE_BASE_TYPES, ...NAIVE_TIMESTAMP_BASE_TYPES]),
];

/**
 * STRUCTURE attributes — removed from the candidate pool outright. A
 * campaign's own start_date describes the row, not the time axis of the table.
 */
const NON_GRAIN_DATE_COLUMNS = new Set(["start_date", "end_date", "created_at", "updated_at"]);

/**
 * ROW-MUTATION stamps — "when this row last changed". Disqualified from
 * winning, but deliberately LEFT IN the candidate pool so they still count
 * toward the ambiguity check below.
 *
 * Why disqualified: a timeseries table is only ever read as
 * `WHERE col >= today - repull_window` (buildSourceSelectSql), so keying one
 * on a mutation stamp archives recently-touched rows and NEVER the historical
 * body of the table — while reporting success. That is quietly destructive,
 * not merely imprecise.
 *
 * Why still counted: removing them instead was measured against the live
 * catalog and is actively dangerous. It hands victory to whatever column is
 * left beside them — it promoted 17 further tables onto `lastupdateddate` the
 * moment `creationdate` stopped breaking their tie, and it flipped
 * `refdata_label` (ENABLED, with a live BigQuery table partitioned on
 * `_archived_at`) from snapshot to timeseries on `created_date`, which would
 * have pointed buildTransactionSql's DML at a column that table is not
 * partitioned on. A mutation stamp is not evidence for any OTHER column being
 * the grain; its presence means the grain is unknown.
 *
 * created_date is deliberately ABSENT despite the name similarity: it is when
 * the EVENT occurred for the account-status and offer-change event reports,
 * where it is a DATE and is their current date column.
 */
const MUTATION_STAMP_COLUMNS = new Set([
  "updated_date",
  "last_updated_date",
  "lastupdateddate",
  "systemlastupdateddate",
  "creationdate",
]);

export function detectDateColumn(columns: SourceColumn[]): string | null {
  const byName = new Map(columns.map((c) => [c.name.toLowerCase(), c.name]));
  for (const candidate of DATE_COLUMN_PRIORITY) {
    const hit = byName.get(candidate);
    if (hit) return hit;
  }
  // Nothing named conventionally — accept a lone date-typed column, but never
  // a structure attribute. Tiers are tried in order and the first tier holding
  // any candidate decides: a single one is the answer, and a tie there means
  // the grain is genuinely ambiguous, so we stop rather than let a lower tier
  // supply a worse column with false confidence.
  const eligible = columns.filter((c) => !NON_GRAIN_DATE_COLUMNS.has(c.name.toLowerCase()));
  for (const tier of DATE_GRAIN_TYPE_TIERS) {
    const typed = eligible.filter((c) => tier.has(baseType(c.type)));
    if (typed.length === 0) continue;
    if (typed.length > 1) return null;
    return MUTATION_STAMP_COLUMNS.has(typed[0].name.toLowerCase()) ? null : typed[0].name;
  }
  return null;
}

export function classifyTableKind(dateColumn: string | null): TableKind {
  if (!dateColumn) return "snapshot";
  const lower = dateColumn.toLowerCase();
  if (lower.includes("week") || lower.includes("month")) return "period";
  return "timeseries";
}

/** Strip parameters and whitespace: "VARCHAR(256)" -> "varchar". */
function baseType(redshiftType: string): string {
  return redshiftType.toLowerCase().split("(")[0].trim();
}

const TYPE_MAP: Record<string, string> = {
  // Spectrum / Hive external types
  string: "STRING",
  int: "INT64",
  bigint: "INT64",
  smallint: "INT64",
  double: "FLOAT64",
  float: "FLOAT64",
  boolean: "BOOL",
  timestamp: "TIMESTAMP",
  date: "DATE",
  decimal: "NUMERIC",
  // Native Redshift types
  varchar: "STRING",
  "character varying": "STRING",
  char: "STRING",
  character: "STRING",
  text: "STRING",
  int2: "INT64",
  int4: "INT64",
  int8: "INT64",
  integer: "INT64",
  numeric: "NUMERIC",
  real: "FLOAT64",
  float4: "FLOAT64",
  float8: "FLOAT64",
  "double precision": "FLOAT64",
  bool: "BOOL",
  timestamptz: "TIMESTAMP",
  "timestamp without time zone": "TIMESTAMP",
  "timestamp with time zone": "TIMESTAMP",
};

/**
 * An unmapped type falls back to STRING and is flagged, never dropped.
 * The caller writes the flag into catalog.notes (spec §6).
 */
export function mapRedshiftTypeToBigQuery(redshiftType: string): {
  bqType: string;
  mapped: boolean;
} {
  const base = baseType(redshiftType);
  const bqType = TYPE_MAP[base];
  return bqType ? { bqType, mapped: true } : { bqType: "STRING", mapped: false };
}

/**
 * Buckets where BigQuery's bare type loses information the source type
 * still carries, so two source types sharing that bqType can be a real
 * semantic change rather than a synonym. Every other bucket collapses
 * cleanly — VARCHAR(n)->STRING regardless of n, INT2/4/8->INT64 regardless
 * of width — because buildTableSchema (bigquery-archive.ts) emits a bare
 * type with no length/width qualifier, so a bqType-only comparison is
 * already correct there.
 */
const LOSSY_BUCKETS = new Set(["NUMERIC", "TIMESTAMP"]);

/**
 * Timezone-awareness of a Redshift TIMESTAMP spelling:
 * true = tz-aware, false = naive, null = not a recognised TIMESTAMP spelling.
 *
 * Exists because TYPE_MAP collapses all four TIMESTAMP spellings onto a bare
 * BigQuery TIMESTAMP, but naive and tz-aware need OPPOSITE handling when a
 * value crosses to BigQuery (see toBqJsonValue in bigquery-archive.ts): the
 * `pg` driver returns a Date whose LOCAL components are the source digits for
 * a naive column, but a correct absolute instant for a tz-aware one. bqType
 * alone cannot tell those apart, so the raw source type has to be carried all
 * the way to the value mapper.
 *
 * Returns null rather than defaulting, because either default would be wrong
 * by exactly the host's UTC offset for the other case.
 */
export function timestampIsTzAware(redshiftType: string | null): boolean | null {
  if (!redshiftType) return null;
  const base = baseType(redshiftType);
  if (TZ_AWARE_BASE_TYPES.has(base)) return true;
  if (NAIVE_TIMESTAMP_BASE_TYPES.has(base)) return false;
  return null;
}

/**
 * Canonical form for a type within a LOSSY_BUCKETS bucket — used only to
 * tell a real semantic change from a spelling difference the two live
 * Redshift catalog views (SVV_COLUMNS vs SVV_EXTERNAL_COLUMNS) can produce
 * for the same underlying type:
 *  - NUMERIC: numeric/decimal are synonyms, so the base name is normalised
 *    away; the precision/scale parameters are kept, since BigQuery's schema
 *    is always a bare NUMERIC (default precision 38 / scale 9 — see
 *    buildTableSchema) and carries none of the source's own precision or
 *    scale. "numeric(18,2)" and "decimal(18,2)" canonicalise the same;
 *    "numeric(18,2)" and "numeric(18,12)" do not.
 *  - TIMESTAMP: canonicalised to tz-awareness. BigQuery TIMESTAMP is always
 *    an absolute UTC instant, so a naive<->aware change alters what a
 *    stored value MEANS, not just how the column is spelled.
 */
function canonicalLossyType(redshiftType: string): string {
  const base = baseType(redshiftType);
  if (base === "numeric" || base === "decimal") {
    const params = redshiftType.match(/\(([^)]*)\)/);
    return `numeric(${params ? params[1].replace(/\s+/g, "") : ""})`;
  }
  // Anything reaching here is in the TIMESTAMP bucket. Reads the same
  // classifier the value mapper uses so the two can never disagree about what
  // "naive" means; an unrecognised spelling canonicalises as naive, which is
  // the pre-existing behaviour and keeps the drift guard from firing on a
  // spelling it simply doesn't know.
  return timestampIsTzAware(redshiftType) === true ? "timestamp:tz" : "timestamp:naive";
}

/**
 * True when a column's type changed since the prior discovery snapshot in a
 * way that could silently corrupt or misread archived data — spec section 6.
 *
 * A bqType change is always drift. Below that, most same-bqType changes are
 * true synonyms as far as the archive is concerned (see LOSSY_BUCKETS) and
 * flagging them would be pure alert fatigue on a guard whose only value is
 * being believed when it fires. NUMERIC and TIMESTAMP are the two buckets
 * where that collapse actually loses meaning worth alerting on, so those get
 * a second, narrower comparison against a canonicalised form of the raw type.
 */
export function columnTypeDrifted(
  prior: { type: string; bqType: string },
  current: { type: string; bqType: string }
): boolean {
  if (prior.bqType !== current.bqType) return true;
  if (!LOSSY_BUCKETS.has(current.bqType)) return false;
  return canonicalLossyType(prior.type) !== canonicalLossyType(current.type);
}

/**
 * Last line of defence for identifiers that reach a SQL string.
 *
 * The real control is the catalog allowlist (spec §10) — a table not present
 * in redshift_archive_catalog is never queried. This is the belt to that
 * suspenders, because this codebase has shipped a SQL injection before
 * (reports-overview, fixed in PR #11) and forecast-redshift.ts:148 still
 * interpolates. account_id and date bounds are ALWAYS bound parameters and
 * must never come through here.
 */
export function assertSafeIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`Unsafe identifier rejected: ${JSON.stringify(identifier)}`);
  }
  return identifier;
}

/**
 * Documented upstream restatement windows (spec §3.3). Informational — the
 * effective re-pull window is catalog.repull_window_days, which defaults to
 * 14 for every table because 14 covers all three of these with headroom.
 */
export function sourceRefreshWindowDays(tableName: string): number {
  const t = tableName.toLowerCase();
  if (t.includes("settlement")) return 2;
  if (t.includes("businessreport") || t.includes("allorders") || t.includes("orderreport")) return 10;
  return 14;
}
