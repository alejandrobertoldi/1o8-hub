/**
 * Local Asana sync: mirrors every open task of the reporting project
 * (ASANA_REPORTING_PROJECT_GID, "AAA - 1o8 Agency Reporting") into asana_tasks,
 * the same job /api/cron/asana-tasks-sync runs every 15 min on Vercel.
 * Read-only towards Asana. Needs ASANA_ACCESS_TOKEN in .env.local.
 *
 * Usage: npm run sync:asana
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { hasAsanaToken } = await import("../../src/lib/onboarding/create-asana-project");
  const { dbAsanaSyncDeps, recordSyncState, runAsanaSync } = await import("../../src/lib/my-dashboard/asana-sync");
  if (!hasAsanaToken()) {
    console.error("ASANA_ACCESS_TOKEN is not set in .env.local (see LOCAL.md → Asana).");
    process.exit(1);
  }
  try {
    const r = await runAsanaSync(dbAsanaSyncDeps());
    await recordSyncState({ ok: true, open: r.open });
    console.log(`Asana sync OK: ${r.open} open tasks (${r.pages} pages), ${r.closed} marked completed.`);

    const { db } = await import("../../src/lib/db");
    const { asanaTasks } = await import("../../src/lib/db/schema");
    const { and, eq, isNull, sql } = await import("drizzle-orm");
    const [{ unmatched }] = await db
      .select({ unmatched: sql<number>`count(*)`.mapWith(Number) })
      .from(asanaTasks)
      .where(and(eq(asanaTasks.completed, false), isNull(asanaTasks.clientIdCode)));
    console.log(`Open tasks not linked to a client (internal or unrecognised names): ${unmatched}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordSyncState({ ok: false, error: message }).catch(() => {});
    console.error(`Asana sync failed: ${message}`);
    process.exit(1);
  }
  process.exit(0);
}

main();
