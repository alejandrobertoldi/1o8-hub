/**
 * Amazon Redshift (Intentwise) client for Sales Summary v2.
 *
 * Uses the `pg` library since postgres.js has compatibility issues
 * with Redshift's catalog (missing b.typarray column).
 *
 * Connection: analytics.intentwise.com:5439/data_platform
 * Schema: intentwise_ecommerce_graph
 */
import { Pool, PoolClient } from "pg";

/** Client-side read timeout for ordinary report queries. */
const DEFAULT_QUERY_TIMEOUT_MS = 90_000;

/**
 * One pool per distinct query timeout, because `query_timeout` is a
 * pool-level option in `pg` and cannot be set per query.
 *
 * Needed for the Order Geography snapshot: its source is an external
 * datashare where a single account's 365-day scan costs ~70s and has exceeded
 * 280s under load, so it would never complete under the 90s default. Every
 * other caller keeps that default untouched.
 */
const pools = new Map<number, Pool>();

function getPool(queryTimeoutMs: number = DEFAULT_QUERY_TIMEOUT_MS): Pool {
  const existing = pools.get(queryTimeoutMs);
  if (existing) return existing;

  const host = process.env.REDSHIFT_HOST;
  const port = parseInt(process.env.REDSHIFT_PORT || "5439", 10);
  const database = process.env.REDSHIFT_DATABASE;
  const user = process.env.REDSHIFT_USER;
  const password = process.env.REDSHIFT_PASSWORD;

  if (!host || !database || !user || !password) {
    throw new Error(
      "Missing Redshift env vars: REDSHIFT_HOST, REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD"
    );
  }

  const created = new Pool({
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 30000,
    query_timeout: queryTimeoutMs,
  });

  // Reset stale pool on connection errors
  created.on("error", (err) => {
    console.error("[Redshift] Pool error, resetting:", err.message);
    pools.delete(queryTimeoutMs);
  });

  pools.set(queryTimeoutMs, created);
  return created;
}

export type RedshiftQueryOptions = {
  /** Overrides the client-side read timeout. Defaults to 90s. */
  timeoutMs?: number;
  /**
   * queryRedshiftOrThrow only: retry once after a failure (default true).
   * Turn it off for heavy scans, where a timeout means the warehouse is busy
   * and a re-run adds load instead of recovering from a stale connection.
   */
  retry?: boolean;
};

/**
 * Run a SQL query against Redshift and return typed rows.
 * Supports parameterized queries ($1, $2, ...) to prevent SQL injection.
 * Retries once on connection failure (stale pool in serverless).
 */
export async function queryRedshift<T = Record<string, unknown>>(
  query: string,
  params?: unknown[],
  options?: RedshiftQueryOptions
): Promise<T[]> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  for (let attempt = 0; attempt < 2; attempt++) {
    let client: PoolClient | null = null;
    try {
      const p = getPool(timeoutMs);
      client = await p.connect();
      const result = params
        ? await client.query(query, params)
        : await client.query(query);
      client.release();
      return result.rows as T[];
    } catch (error) {
      if (client) {
        try { client.release(true); } catch { /* ignore */ }
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Redshift] Query failed (attempt ${attempt + 1}):`, msg);
      // On first failure, reset pool and retry (stale connection)
      if (attempt === 0) {
        pools.delete(timeoutMs);
        continue;
      }
      return [];
    }
  }
  return [];
}

/**
 * Run a SQL query against Redshift, THROWING on failure.
 *
 * `queryRedshift` returns [] after two failed attempts. That is correct for
 * dashboards and catastrophic for archival: an empty array is
 * indistinguishable from "this client legitimately had no data", so a
 * Redshift outage would mark every work unit successful with zero rows and
 * the verification gate would pass on an empty archive (spec §3.2).
 *
 * Retries once on a stale pool, exactly like queryRedshift, then throws.
 */
export async function queryRedshiftOrThrow<T = Record<string, unknown>>(
  query: string,
  params?: unknown[],
  options?: RedshiftQueryOptions
): Promise<T[]> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS;
  const attempts = options?.retry === false ? 1 : 2;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let client: PoolClient | null = null;
    try {
      const p = getPool(timeoutMs);
      client = await p.connect();
      const result = params
        ? await client.query(query, params)
        : await client.query(query);
      client.release();
      return result.rows as T[];
    } catch (error) {
      lastError = error;
      if (client) {
        try { client.release(true); } catch { /* ignore */ }
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Redshift] Query failed (attempt ${attempt + 1}):`, msg);
      if (attempt === 0) {
        pools.delete(timeoutMs);
        continue;
      }
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`[Redshift] Query failed after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${msg}`);
}
