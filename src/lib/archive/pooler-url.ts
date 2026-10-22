/**
 * Swaps Supavisor's transaction-mode pooler port (6543) for its session-mode
 * port (5432) on the SAME host — no new env var, no dashboard trip. A plain
 * string replace, never `new URL(...).toString()`: the latter re-encodes the
 * password and can corrupt one containing special characters.
 *
 * Needed for anything that requires session-scoped Postgres semantics (e.g.
 * pg_try_advisory_lock/pg_advisory_unlock) — those are silently unreliable
 * over the transaction-mode pooler, since Supavisor can return the backend to
 * the shared pool as soon as the lock statement's implicit transaction
 * commits.
 */
export function toSessionModeUrl(databaseUrl: string): string {
  return databaseUrl.replace(":6543/", ":5432/");
}
