import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

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
    // independent queries in a handler actually overlap. We connect through
    // Supavisor on port 6543 (transaction mode, verified against production), so
    // client connections are multiplexed and cheap — the session-mode concern in
    // the original comment does not apply on this port.
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
    // Production stays at 20s deliberately. Vercel instances are short-lived
    // and numerous, and holding idle Supavisor slots across all of them is the
    // worse trade there. Guarded on NODE_ENV rather than VERCEL so any
    // production build keeps the conservative value.
    idle_timeout: process.env.NODE_ENV === "production" ? 20 : 300,
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
