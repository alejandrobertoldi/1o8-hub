/**
 * Read-only: everything the hub has on one person's hours, to answer "my hours
 * disappeared". Lists their time logs (newest first, with when each was created
 * and last edited), their timer, and any logged time-log deletions.
 *
 *   npm run hours:lookup -- <name or email part> [--prod]
 */
import { and, desc, eq, ilike, or } from "drizzle-orm";

async function main() {
  const who = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!who) throw new Error("Pass part of the person's name or email, e.g. npm run hours:lookup -- komal --prod");
  if (process.argv.includes("--prod")) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is missing from .env.local");
    process.env.DATABASE_URL = url;
  }
  const { db } = await import("@/lib/db");
  const { adminEventLog, timeLogTimers, timeLogs, users } = await import("@/lib/db/schema");

  const people = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(or(ilike(users.name, `%${who}%`), ilike(users.email, `%${who}%`)));
  if (!people.length) {
    console.log(`Nobody matches "${who}".`);
    process.exit(0);
  }

  for (const p of people) {
    console.log(`\n=== ${p.name ?? "(no name)"} <${p.email}> (${p.role}) ===`);
    const logs = await db.select().from(timeLogs).where(eq(timeLogs.userId, p.id)).orderBy(desc(timeLogs.entryDate), desc(timeLogs.createdAt));
    const total = logs.reduce((a, l) => a + Number(l.hours), 0);
    console.log(`Time logs: ${logs.length} (${total} h)`);
    for (const l of logs) {
      const edited = l.updatedAt.getTime() - l.createdAt.getTime() > 1000 ? ` · edited ${l.updatedAt.toISOString()}` : "";
      console.log(
        `  ${l.entryDate}  ${String(l.hours).padStart(5)} h  ${l.clientIdCode.padEnd(4)} ${l.projectNumber}  ${l.department}` +
          `  · created ${l.createdAt.toISOString()}${edited}${l.note ? `  "${l.note}"` : ""}`,
      );
    }
    const [timer] = await db.select().from(timeLogTimers).where(eq(timeLogTimers.userId, p.id)).limit(1);
    console.log(
      timer
        ? `Timer: ${timer.startedAt ? `running since ${timer.startedAt.toISOString()}` : "paused"}, ${timer.elapsedSeconds}s banked, for ${timer.entryDate}`
        : "Timer: none",
    );
    const deletions = await db
      .select({ at: adminEventLog.createdAt, by: adminEventLog.userEmail, message: adminEventLog.message })
      .from(adminEventLog)
      .where(and(eq(adminEventLog.action, "time-log:delete"), eq(adminEventLog.resourceId, p.id)))
      .orderBy(desc(adminEventLog.createdAt))
      .limit(50);
    console.log(`Logged deletions: ${deletions.length}${deletions.length ? "" : " (deletions are only logged from 2026-11-03 on)"}`);
    for (const d of deletions) console.log(`  ${d.at.toISOString()} by ${d.by}: ${d.message}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
