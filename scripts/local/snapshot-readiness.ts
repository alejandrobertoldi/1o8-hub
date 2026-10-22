/**
 * Local version of the morning cron: sync Asana, then save today's Readiness
 * snapshot (Chicago date). `-- --force` replaces today's if it exists.
 *
 * Usage: npm run snapshot:readiness [-- --force]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { hasAsanaToken } = await import("../../src/lib/onboarding/create-asana-project");
  const { dbAsanaSyncDeps, recordSyncState, runAsanaSync } = await import("../../src/lib/my-dashboard/asana-sync");
  const { captureSnapshot, computeReadiness } = await import("../../src/lib/readiness/server");
  if (hasAsanaToken()) {
    const r = await runAsanaSync(dbAsanaSyncDeps());
    await recordSyncState({ ok: true, open: r.open });
    console.log(`Asana synced: ${r.open} open tasks.`);
  }
  const s = await captureSnapshot({ force: process.argv.includes("--force") });
  const b = await computeReadiness(s.date);
  console.log(
    s.saved ? `Snapshot saved for ${s.date} (${s.rows} rows).` : `A snapshot for ${s.date} already exists (use --force to replace it).`,
  );
  console.log(`Open ${b.total.open} · due today ${b.total.dueToday} · overdue ${b.total.overdue} · readiness ${b.total.readiness}%`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
