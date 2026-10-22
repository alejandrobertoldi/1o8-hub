/**
 * Local draft seed: creates the owner account used by the dev login and
 * loads the 1o8 client sheet ("All 1o8 Clients (Final)" → tab "AAC 1o8")
 * into the `aac` table, the same table the MarketFoundry hub fills from
 * BigQuery.
 *
 * The 1o8 sheet's column names differ from MarketFoundry's AAC, so the
 * columns the app reads by name are copied onto MF's names (see
 * COLUMN_ALIASES). Every original column is also kept in raw_data.
 *
 * Usage: npm run seed:local            (pulls the sheet's CSV export)
 *        npm run seed:local -- --file data/aac.csv
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import fs from "node:fs/promises";
import postgres from "postgres";
import { parse } from "csv-parse/sync";

const SERVICE_FIRST = "SEO";
const SERVICE_COUNT = 30; // columns AB..BE in the sheet ("SERVICES" block)

// 1o8 sheet header → MarketFoundry AAC key the app code reads.
const COLUMN_ALIASES: Record<string, string> = {
  "ClientIDCode - ASANA": "ClientIDCode",
  ExecutiveStrategist_1o8: "ExecutiveStrategist_MF",
  AccountManager1_1o8: "AccountManager_MF",
  ProjectManager_1o8: "ProjectManager_MF",
  CreativeManager_1o8: "DesignManager_MF",
  SEOManager_1o8: "SEOManager_MF",
  PaidManager_1o8: "PPCManager_MF",
  Billingemail1: "BillingEmail1",
  Billingemail2: "BillingEmail2",
  Billingemail3: "BillingEmail3",
  Billingemail4: "BillingEmail4",
  Dashboard: "DashboardURL",
};

async function loadCsv(file?: string, gid = process.env.AAC_SHEET_GID): Promise<string> {
  if (file) return fs.readFile(file, "utf8");
  const url = `https://docs.google.com/spreadsheets/d/${process.env.AAC_SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith("<")) {
    throw new Error(`Could not download the sheet (${res.status}). Export it as CSV and pass --file.`);
  }
  return text;
}

async function main() {
  const fileIdx = process.argv.indexOf("--file");
  const csv = await loadCsv(fileIdx > 0 ? process.argv[fileIdx + 1] : undefined);
  const grid = parse(csv, { relax_column_count: true }) as string[][];

  const headerIdx = grid.findIndex((r) => r[0]?.trim() === "ClientStatus");
  if (headerIdx < 0) throw new Error('Header row ("ClientStatus") not found');
  const rawHeader = grid[headerIdx].map((h) => h.replace(/\s+/g, " ").trim());
  const svcStart = rawHeader.indexOf(SERVICE_FIRST);
  // Services repeat labels used elsewhere ("Strategy", "Paid Media",
  // "Dashboard"), so they are namespaced to keep keys unique.
  const header = rawHeader.map((h, i) =>
    svcStart >= 0 && i >= svcStart && i < svcStart + SERVICE_COUNT ? `Service: ${h}` : h,
  );

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  // ── Owner account for the dev login ──
  const ownerEmail = process.env.DEV_LOGIN_EMAIL;
  if (ownerEmail) {
    await sql`
      INSERT INTO users (email, name, role, is_super_admin)
      VALUES (${ownerEmail}, 'Alejandro Bertoldi', 'owner', true)
      ON CONFLICT (email) DO UPDATE SET role = 'owner', is_super_admin = true`;
    console.log(`Owner account ready: ${ownerEmail}`);
  }

  // ── Team (tab "1o8_Performance_Team") ── same sync as `npm run sync:team`
  // (creates missing people, fills empty fields, never removes anyone).
  if (process.env.TEAM_SHEET_GID) {
    const { loadTeamSheetGrid, syncTeamDirectory } = await import("../../src/lib/team/directory-sync");
    const t = await syncTeamDirectory(await loadTeamSheetGrid());
    console.log(`Team: ${t.inSheet} in sheet, ${t.created.length} created, ${t.updated} already in the hub`);
  }

  // ── Clients ──
  const seen = new Set<string>();
  const skipped: string[] = [];
  let upserted = 0;
  for (const row of grid.slice(headerIdx + 1)) {
    const raw: Record<string, string> = {};
    header.forEach((h, i) => {
      const v = (row[i] ?? "").trim();
      if (!h || !v) return;
      raw[h] = v;
      const alias = COLUMN_ALIASES[h];
      if (alias) raw[alias] = v;
    });
    const name = raw.ClientName;
    const code = raw.ClientIDCode;
    if (!name) continue;
    if (!code) { skipped.push(`${name} (no ClientIDCode)`); continue; }
    if (seen.has(code.toUpperCase())) { skipped.push(`${name} (duplicate code ${code})`); continue; }
    seen.add(code.toUpperCase());

    await sql`
      INSERT INTO aac (client_id_code, client_status, client_name, raw_data, updated_at)
      VALUES (${code}, ${raw.ClientStatus ?? "Active"}, ${name}, ${sql.json(raw)}, now())
      ON CONFLICT (client_id_code) DO UPDATE SET
        client_status = excluded.client_status,
        client_name = excluded.client_name,
        raw_data = excluded.raw_data,
        updated_at = now()`;
    upserted++;
  }

  console.log(`Clients loaded into aac: ${upserted}`);
  if (skipped.length) console.log(`Skipped ${skipped.length}:\n  - ${skipped.join("\n  - ")}`);
  await sql.end();
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
