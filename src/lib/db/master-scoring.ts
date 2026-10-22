import { getTableColumns, type SQL } from "drizzle-orm";
import { db } from "./index";
import { master } from "./schema";

/**
 * Shared query path for completeness scoring reads against `master`.
 *
 * Why this exists: `master` has ~14 JSONB columns, and `change_log` is an
 * append-only audit trail that grows without bound. A plain `db.select()`
 * (SELECT *) over a whole client hydrates all of it, and on heavy clients that
 * payload is large enough to trip a connection reset (ECONNRESET) over the
 * Supabase pooler — especially on slow local dev where connections are held
 * longer. Completeness only reads `productType`, the content JSONB blobs and
 * `rawColumnValues` (see calculateCompleteness -> getProductFieldValue); it
 * never reads `change_log`. Projecting it away is a safe, monotonic reduction.
 *
 * Route both scoring reads through here so the fix can't drift back to SELECT *
 * in one place while staying fixed in another.
 */

// `master` minus the unbounded, never-scored change_log column.
const { changeLog: _omitChangeLog, ...scoringColumns } = getTableColumns(master);

// postgres.js surfaces a dropped/reset socket as one of these codes, on the
// error itself or on its `cause`.
const TRANSIENT_CONN_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "CONNECTION_ENDED",
  "CONNECTION_CLOSED",
  "CONNECTION_DESTROYED",
]);

export function isTransientConnError(err: unknown): boolean {
  const top = (err as { code?: string })?.code;
  const cause = (err as { cause?: { code?: string } })?.cause?.code;
  return TRANSIENT_CONN_CODES.has(top ?? "") || TRANSIENT_CONN_CODES.has(cause ?? "");
}

/**
 * Select `master` rows for completeness scoring, excluding `change_log`, with a
 * single retry on a transient connection reset (a fresh connection recovers a
 * stale pooled socket without masking a genuinely failing query).
 *
 * The returned rows omit `change_log`; callers pass them to calculateCompleteness,
 * which never reads that column, so a cast to Product at the call site is safe.
 */
export async function selectMasterForScoring(where: SQL | undefined) {
  const run = () => db.select(scoringColumns).from(master).where(where);
  try {
    return await run();
  } catch (err) {
    if (!isTransientConnError(err)) throw err;
    return await run();
  }
}
