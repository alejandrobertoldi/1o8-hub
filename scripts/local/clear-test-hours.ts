/**
 * One-off: hour logging went live on 2026-11-02, so every time log dated before
 * that is a test entry and is deleted (no comparisons against October's tests).
 * Dry run by default (lists what would go, by person); --apply deletes.
 * --prod targets production. --before=YYYY-MM-DD moves the cutoff.
 *
 *   npm run hours:clear-tests -- [--prod] [--before=2026-11-02] [--apply]
 */
import { asc, eq, lt, sql } from "drizzle-orm";

async function main() {
  const apply = process.argv.includes("--apply");
  const before = process.argv.find((a) => a.startsWith("--before="))?.slice(9) ?? "2026-11-02";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) throw new Error("--before must be YYYY-MM-DD");
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
  }
  const { db } = await import("@/lib/db");
  const { timeLogs, users } = await import("@/lib/db/schema");

  const rows = await db
    .select({
      who: sql<string>`coalesce(${users.name}, ${users.email})`,
      entries: sql<number>`count(*)::int`,
      hours: sql<string>`sum(${timeLogs.hours})`,
      first: sql<string>`min(${timeLogs.entryDate})`,
      last: sql<string>`max(${timeLogs.entryDate})`,
    })
    .from(timeLogs)
    .leftJoin(users, eq(users.id, timeLogs.userId))
    .where(lt(timeLogs.entryDate, before))
    .groupBy(users.name, users.email)
    .orderBy(asc(sql`1`));

  const total = rows.reduce((n, r) => n + r.entries, 0);
  console.log(`Time logs dated before ${before}: ${total}`);
  for (const r of rows) console.log(`  ${r.who}: ${r.entries} entries, ${Number(r.hours)} h (${r.first} → ${r.last})`);

  if (!apply || total === 0) {
    console.log(total ? "\nDry run — nothing deleted. Add --apply to delete these entries." : "\nNothing to delete.");
    process.exit(0);
  }
  const deleted = await db.delete(timeLogs).where(lt(timeLogs.entryDate, before)).returning({ id: timeLogs.id });
  console.log(`\nDeleted ${deleted.length} time log(s) dated before ${before}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
