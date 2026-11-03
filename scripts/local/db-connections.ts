/**
 * Read-only: who holds the database connections right now (pg_stat_activity),
 * to diagnose "max clients reached in session mode". Goes through the
 * transaction pooler so it still gets in when the session pool is full.
 *
 *   npm run db:connections -- [--prod]
 */
import { sql } from "drizzle-orm";

async function main() {
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
    process.env.DB_POOLER = "transaction";
  }
  const { db } = await import("@/lib/db");

  const [limits] = await db.execute<{ max_connections: string }>(sql`select current_setting('max_connections') as max_connections`);
  const byState = await db.execute<{ usename: string | null; application_name: string; state: string | null; n: string; oldest: string | null }>(sql`
    select usename, application_name, state, count(*)::text as n,
           min(coalesce(state_change, backend_start))::text as oldest
    from pg_stat_activity
    where backend_type = 'client backend'
    group by 1, 2, 3
    order by count(*) desc`);
  const stuck = await db.execute<{ pid: number; state: string | null; since: string; query: string }>(sql`
    select pid, state, coalesce(state_change, backend_start)::text as since, left(query, 140) as query
    from pg_stat_activity
    where backend_type = 'client backend' and state in ('active', 'idle in transaction')
      and coalesce(state_change, backend_start) < now() - interval '1 minute'
      and pid <> pg_backend_pid()
    order by since
    limit 20`);

  console.log(`max_connections: ${limits.max_connections}`);
  console.log("\nConnections by user / app / state:");
  for (const r of byState) console.log(`  ${String(r.n).padStart(3)}  ${r.usename ?? "?"}  ${r.application_name || "(no app name)"}  ${r.state ?? "?"}  oldest ${r.oldest}`);
  console.log(`\nActive or open-transaction for over a minute: ${stuck.length}`);
  for (const s of stuck) console.log(`  pid ${s.pid}  ${s.state}  since ${s.since}  ${s.query.replace(/\s+/g, " ")}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
