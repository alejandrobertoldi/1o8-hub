/**
 * Seed `fulfillment_centers` from AMZ Prep's "Amazon FBA Locations 2025" workbook.
 *
 *   tsx scripts/_import-fulfillment-centers.ts <workbook.xlsx> [--report out.json]          # dry run
 *   tsx scripts/_import-fulfillment-centers.ts <workbook.xlsx> --apply                      # writes
 *
 * Dry run is the default and touches no database. --apply INSERTS new codes in ONE
 * transaction and never touches an existing row: rows were hand-corrected after the
 * first load (SUEH/SUHX/VUWC state, YYZ10 type, 10 addresses) and the sheet would
 * silently revert them. Requires migration 0122.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const SOURCE = "amzprep-2025";
const TABS = ["USA Locations", "Canada Locations"];

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const apply = args.includes("--apply");
  const reportIdx = args.indexOf("--report");
  const reportPath = reportIdx >= 0 ? args[reportIdx + 1] : null;
  if (!file) throw new Error("usage: _import-fulfillment-centers.ts <workbook.xlsx> [--apply] [--report out.json]");

  const xlsxMod = await import("xlsx");
  const XLSX = (xlsxMod as unknown as { default?: typeof xlsxMod }).default ?? xlsxMod;
  const fs = await import("fs");
  const { parseAmzPrepSheets } = await import("../src/lib/fulfillment-centers/parse-amzprep");

  const wb = XLSX.readFile(file);
  const tabs = TABS.map((tab) => {
    const ws = wb.Sheets[tab];
    if (!ws) throw new Error(`workbook has no "${tab}" tab`);
    return { tab, rows: XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) };
  });
  const result = parseAmzPrepSheets(tabs);
  const { records } = result;

  const by = (k: (r: (typeof records)[number]) => string | null) =>
    records.reduce<Record<string, number>>((acc, r) => ((acc[k(r) ?? "(blank)"] = (acc[k(r) ?? "(blank)"] ?? 0) + 1), acc), {});

  console.log(`records: ${records.length}`, by((r) => r.country));
  console.log("facility types:", by((r) => r.facilityType));
  console.log(`regions: US ${new Set(records.filter((r) => r.country === "US").map((r) => r.region)).size}, CA ${new Set(records.filter((r) => r.country === "CA").map((r) => r.region)).size}`);
  console.log(`with city: ${records.filter((r) => r.city).length}, with postal: ${records.filter((r) => r.postalCode).length}`);
  for (const [label, list] of [
    ["rejected", result.rejected],
    ["state column corrected by address", result.corrected],
    ["conflicting duplicates (first kept)", result.conflicts],
    ["region from state column (no address)", result.regionFromColumn],
  ] as const) {
    console.log(`\n${label}: ${list.length}`);
    for (const i of list) console.log(`  ${i.tab} row ${i.sheetRow}  ${i.code}  ${i.reason}`);
  }
  if (reportPath) fs.default.writeFileSync(reportPath, JSON.stringify(result, null, 2));

  if (!apply) {
    console.log("\nDRY RUN — no database writes. Re-run with --apply to insert new codes.");
    process.exit(0);
  }

  const postgres = (await import("postgres")).default;
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither DIRECT_DATABASE_URL nor DATABASE_URL is set");
  const sql = postgres(url, { max: 1 });
  try {
    const before = await sql`SELECT count(*)::int AS n FROM fulfillment_centers`;
    await sql.begin(async (txRaw) => {
      // TransactionSql loses its call signature through Omit<> in postgres.js typings.
      const tx = txRaw as unknown as typeof sql;
      for (let i = 0; i < records.length; i += 200) {
        const chunk = records.slice(i, i + 200).map((r) => ({
          code: r.code,
          country: r.country,
          region: r.region,
          city: r.city,
          postal_code: r.postalCode,
          address: r.address,
          facility_type: r.facilityType,
          source: SOURCE,
        }));
        await tx`
          INSERT INTO fulfillment_centers ${tx(chunk, "code", "country", "region", "city", "postal_code", "address", "facility_type", "source")}
          ON CONFLICT (code) DO NOTHING
        `;
      }
    });
    const after = await sql`SELECT country, count(*)::int AS n FROM fulfillment_centers GROUP BY country ORDER BY country`;
    console.log(`\nAPPLIED. rows before: ${before[0].n}; after:`, after.map((r) => `${r.country}=${r.n}`).join(" "));
  } finally {
    await sql.end({ timeout: 5 });
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
