import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * 1o8 (2026-10-23): always use Supabase's SESSION pooler (port 5432), even if
 * DATABASE_URL names the transaction pooler (6543). postgres.js pipelines a
 * query onto a busy connection whenever a handler runs more queries in
 * parallel than `max`, and the transaction pooler never answers that query
 * (reproduced against our Supabase: second round of 4–5 parallel selects hangs
 * every time on 6543, never on 5432). Online that left Readiness and My
 * Dashboard sections on "Loading…" and wedged the pool.
 */
export function toSessionPoolerUrl(url: string): string {
  // One-off scripts that run queries one at a time can use the transaction
  // pooler, which isn't capped at the session pool's 15 clients (so they still
  // get in when the app has the session pool full).
  if (process.env.DB_POOLER === "transaction") return url;
  return /\.pooler\.supabase\.com:6543\//.test(url) ? url.replace(":6543/", ":5432/") : url;
}

const connectionString = toSessionPoolerUrl(process.env.DATABASE_URL!);

// Prevent connection pool exhaustion during HMR in development.
// Each hot-reload re-executes this module, creating a new postgres client.
// Without caching on globalThis, old connections leak and Supabase's pooler
// limit is quickly reached, causing all queries to hang.
const globalForDb = globalThis as unknown as { pgClient: ReturnType<typeof postgres> };

function createPgClient() {
  return postgres(connectionString, {
    prepare: false,
    // Local Postgres (npm run db:local) has no TLS; Supabase requires it.
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
    // Serverless (Vercel) spins up many concurrent instances, each with its own
    // module scope and pool, so keep this small — N instances use N*max slots.
    //
    // It was 1, which turned out to be worse than the exhaustion it guarded
    // against: postgres.js has NO acquire timeout, so a single query that never
    // completes (Vercel freezing a sandbox mid-protocol leaves the transaction
    // open in state=active/wait_event=Client:ClientRead) permanently blocked the
    // instance's ONLY connection. Every later request routed to that warm
    // instance then waited forever — responseStatusCode 0, finalising to a 504
    // at the 60s platform limit. That is the "endless loading" symptom.
    //
    // 3 keeps one wedged connection from starving the instance and lets
    // independent queries in a handler actually overlap. Since 2026-10-23 we go
    // through the SESSION pooler (see toSessionPoolerUrl), where each of these
    // holds a pool slot while open: keep it small, and see idle_timeout.
    max: process.env.VERCEL ? 3 : 10,
    // Development holds idle connections far longer than production does.
    //
    // The local background poll trio (support?count=open, admin/pending-users,
    // time-off/pending-count) fires less often than 20s, so a 20s idle window
    // meant the pool was empty every time they ran and each one paid the
    // measured cold-connection cost again — 1.74s of TLS + auth on top of a
    // 188ms round trip. That pinned all three at 2.3-2.5s for an entire dev
    // session, never improving, which reads like progressive degradation and is
    // not: the pool just keeps getting thrown away. max_lifetime still recycles
    // every 5 min, so connections cannot go stale against the pooler.
    //
    // Production: 5s. We go through the SESSION pooler (toSessionPoolerUrl),
    // where every open client holds one of the pool's slots (15 on Supabase
    // Free) until it closes. With 20s, a handful of warm Vercel instances x 3
    // idle connections filled the pool (2026-11-03: "max clients reached in
    // session mode", Hours looked empty for everyone until it drained). 5s
    // gives slots back between bursts; a cold connection costs ~1–2s, which a
    // burst pays once. Guarded on NODE_ENV rather than VERCEL so any
    // production build keeps the conservative value.
    idle_timeout: process.env.NODE_ENV === "production" ? 5 : 300,
    // 8s, not 30. A hung TLS handshake to the pooler used to eat the whole
    // request budget before a query even started.
    connect_timeout: 8,
    // Recycle faster on Vercel: a socket left half-open after a sandbox freeze
    // is otherwise held until max_lifetime, and postgres.js has no acquire
    // timeout to skip it.
    max_lifetime: process.env.VERCEL ? 60 : 60 * 5,
    // Kernel TCP keepalive (socket.setKeepAlive), so it still fires while the
    // isolate is frozen — unlike idle_timeout, which is a JS timer.
    keep_alive: 10,
  });
}

let client = globalForDb.pgClient ?? createPgClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

/**
 * Live bindings: importers of `db` / `sqlClient` see the new pool after a
 * recycle. In-flight queries keep the old client until it is `.end()`ed.
 */
export let db = drizzle(client, { schema });
export let sqlClient = client;

/**
 * Drop a wedged pool and open a fresh one. Call this after a request budget
 * expires: Promise.race does not cancel the query, so the dead socket would
 * otherwise sit in `busy` forever and starve every later request on this
 * instance. The next attempt then connects cleanly instead of queueing.
 */
export function recycleDbPool(reason: string): void {
  console.warn(`[db] recycling pool: ${reason}`);
  const old = client;
  client = createPgClient();
  if (process.env.NODE_ENV !== "production") {
    globalForDb.pgClient = client;
  }
  sqlClient = client;
  db = drizzle(client, { schema });
  void old.end({ timeout: 2 }).catch(() => {});
}
