/**
 * Team directory sync from the "1o8_Performance_Team" sheet tab.
 * Creates missing people and fills empty fields; never deletes or deactivates.
 *
 * Usage: npm run sync:team [-- --dry-run] [-- --overwrite]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);
  const { loadTeamSheetGrid, syncTeamDirectory } = await import("../../src/lib/team/directory-sync");
  const s = await syncTeamDirectory(await loadTeamSheetGrid(), {
    dryRun: args.includes("--dry-run"),
    overwrite: args.includes("--overwrite"),
  });
  console.log(`Team sheet: ${s.inSheet} people${s.dryRun ? " (dry run — nothing written)" : ""}`);
  console.log(`Created: ${s.created.length}${s.created.length ? ` (${s.created.join(", ")})` : ""}`);
  console.log(`Already in the hub (empty fields filled): ${s.updated}`);
  if (s.leadsAssigned.length) console.log(`Department leads set: ${s.leadsAssigned.join("; ")}`);
  if (s.notActiveInHub.length) console.log(`In the sheet but not active in the hub (left as is): ${s.notActiveInHub.join(", ")}`);
  for (const w of s.warnings) console.log(`  ! ${w}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
