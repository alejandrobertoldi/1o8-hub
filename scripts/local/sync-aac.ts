/**
 * Two-way sync between the hub's clients (aac) and the "AAC 1o8" sheet.
 * Dry run by default — prints what would change on each side.
 *
 *   npm run sync:aac                          # dry run against AAC_SPREADSHEET_ID
 *   npm run sync:aac -- --sheet <id>          # another spreadsheet (e.g. a test copy)
 *   npm run sync:aac -- --apply               # write both sides
 *   npm run sync:aac -- --sheet <id> --pull   # bring sheet changes into the hub only (never writes the sheet)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const sheet = arg("--sheet");
  if (sheet) process.env.AAC_SYNC_SPREADSHEET_ID = sheet;
  const pull = process.argv.includes("--pull");
  const apply = pull || process.argv.includes("--apply");
  const { syncAac } = await import("../../src/lib/aac-sync/sync");
  const { aacSheetTarget } = await import("../../src/lib/aac-sync/google");
  console.log(`${pull ? "PULL (sheet → hub only)" : apply ? "APPLY" : "DRY RUN"} · spreadsheet ${aacSheetTarget().spreadsheetId} · tab "${aacSheetTarget().tab}"`);
  const r = await syncAac({ trigger: "script", dryRun: !apply, pullOnly: pull });
  const fmt = (c: { code: string; key: string; from: string; to: string; conflict?: boolean }) =>
    `  ${c.code.padEnd(6)} ${c.key.slice(0, 32).padEnd(32)} ${JSON.stringify(c.from.slice(0, 40))} → ${JSON.stringify(c.to.slice(0, 40))}${c.conflict ? "  [conflict]" : ""}`;
  console.log(`\nSheet → hub: ${r.toHub.length}`);
  r.toHub.forEach((c) => console.log(fmt(c)));
  console.log(`\nHub → sheet: ${r.toSheet.length}`);
  r.toSheet.forEach((c) => console.log(fmt(c)));
  console.log(`\nNew in the hub (from sheet): ${r.createdInHub.map((c) => `${c.code} ${c.name}`).join(", ") || "—"}`);
  console.log(`New in the sheet (from hub): ${r.appendedToSheet.map((c) => `${c.code} ${c.name}`).join(", ") || "—"}`);
  console.log(`Duplicated codes in the sheet: ${r.duplicates.join("; ") || "—"}`);
  console.log(`Rows without a code (${r.needsCode.length}): ${r.needsCode.map((n) => `row ${n.rowNumber} ${n.name} [${n.status}]`).join("; ")}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
