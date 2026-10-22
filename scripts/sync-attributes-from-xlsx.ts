/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/async-await-in-loop */
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") });
import * as XLSX from "xlsx";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

const directUrl = process.env.DATABASE_URL.replace(":6543/", ":5432/");
const sql = postgres(directUrl, { ssl: "require", max: 1 });
const DRY_RUN = !process.argv.includes("--run");

interface DefinitiveRow {
  reference_group: string;
  subgroup: string;
  hub_label: string;
  general_label: string;
  bq_label: string;
  sc_label: string;
  sc_label_multi: string;
  vc_label: string;
  alr_label: string;
  clr_label: string;
  sb_label: string;
  bq_data_type: string;
  label_max_options: string;
  is_essential: boolean;
  is_vp_flag: boolean;
  description: string;
  category_meta: Record<string, unknown>;
}

function readDefinitiveTab(): DefinitiveRow[] {
  const wb = XLSX.readFile(resolve(__dirname, "../docs/attributes-export.xlsx"));
  const ws = wb.Sheets["Definitive"];
  if (!ws) throw new Error("Definitive sheet not found in XLSX");

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  const headers = raw[0] as string[];
  const rows = raw.slice(1).filter((r) =>
    (r as unknown[]).some((c) => c !== undefined && c !== null && c !== "")
  );

  const get = (row: unknown[], col: string): unknown => {
    const idx = headers.indexOf(col);
    return idx >= 0 ? row[idx] : undefined;
  };

  return rows
    .map((r) => ({
      reference_group: String(get(r, "reference_group") ?? ""),
      subgroup: String(get(r, "subgroup") ?? ""),
      hub_label: String(get(r, "hub_label") ?? ""),
      general_label: String(get(r, "general_label") ?? ""),
      bq_label: String(get(r, "bq_label") ?? ""),
      sc_label: String(get(r, "sc_label") ?? ""),
      sc_label_multi: String(get(r, "sc_label_multi") ?? ""),
      vc_label: String(get(r, "vc_label") ?? ""),
      alr_label: String(get(r, "alr_label") ?? ""),
      clr_label: String(get(r, "clr_label") ?? ""),
      sb_label: String(get(r, "sb_label") ?? ""),
      bq_data_type: String(get(r, "bq_data_type") ?? "STRING"),
      label_max_options: String(get(r, "label_max_options") ?? "1"),
      is_essential: Boolean(get(r, "is_essential")),
      is_vp_flag: Boolean(get(r, "is_vp_flag")),
      description: String(get(r, "description") ?? ""),
      category_meta: (() => {
        const cm = get(r, "category_meta");
        if (!cm || cm === "" || cm === "{}") return {};
        if (typeof cm === "string") {
          try { return JSON.parse(cm); } catch { return {}; }
        }
        return cm as Record<string, unknown>;
      })(),
    }))
    .filter((r) => r.general_label !== "");
}

async function main() {
  const rows = readDefinitiveTab();
  console.log(`Read ${rows.length} rows from Definitive tab`);
  if (DRY_RUN) console.log("DRY RUN — no DB changes will be made. Pass --run to execute.\n");

  const generalLabels = rows.map((r) => r.general_label);

  // Fetch all existing general_labels from DB and diff in JS
  const existing = await sql<{ general_label: string }[]>`
    SELECT general_label FROM attributes ORDER BY general_label
  `;
  const labelsSet = new Set(generalLabels);
  const toDelete = existing.filter((r) => !labelsSet.has(r.general_label));
  console.log(`Rows to DELETE (in DB but not in Definitive): ${toDelete.length}`);
  toDelete.forEach((r) => console.log("  DELETE:", r.general_label));

  const currentCount = await sql`SELECT COUNT(*) as n FROM attributes`;
  console.log(`\nCurrent DB row count: ${currentCount[0].n}`);
  console.log(`Target row count after sync: ${rows.length}`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Run with --run to apply changes.");
    await sql.end();
    return;
  }

  // Execute deletions
  if (toDelete.length > 0) {
    const labelsToDelete = toDelete.map((r) => r.general_label);
    const deleted = await sql`
      DELETE FROM attributes
      WHERE general_label = ANY(${sql.array(labelsToDelete)})
      RETURNING general_label
    `;
    console.log(`\nDeleted ${deleted.length} rows`);
  }

  // Upsert all rows
  let upserted = 0;
  for (const row of rows) {
    await sql`
      INSERT INTO attributes (
        general_label, hub_label, reference_group, subgroup,
        bq_label, sc_label, sc_label_multi, vc_label,
        alr_label, clr_label, sb_label,
        bq_data_type, label_max_options,
        is_essential, is_vp_flag, description, category_meta
      ) VALUES (
        ${row.general_label}, ${row.hub_label}, ${row.reference_group}, ${row.subgroup},
        ${row.bq_label}, ${row.sc_label}, ${row.sc_label_multi}, ${row.vc_label},
        ${row.alr_label}, ${row.clr_label}, ${row.sb_label},
        ${row.bq_data_type}, ${row.label_max_options},
        ${row.is_essential}, ${row.is_vp_flag}, ${row.description},
        ${sql.json(row.category_meta as Parameters<typeof sql.json>[0])}
      )
      ON CONFLICT (general_label) DO UPDATE SET
        hub_label = EXCLUDED.hub_label,
        reference_group = EXCLUDED.reference_group,
        subgroup = EXCLUDED.subgroup,
        bq_label = EXCLUDED.bq_label,
        sc_label = EXCLUDED.sc_label,
        sc_label_multi = EXCLUDED.sc_label_multi,
        vc_label = EXCLUDED.vc_label,
        alr_label = EXCLUDED.alr_label,
        clr_label = EXCLUDED.clr_label,
        sb_label = EXCLUDED.sb_label,
        bq_data_type = EXCLUDED.bq_data_type,
        label_max_options = EXCLUDED.label_max_options,
        is_essential = EXCLUDED.is_essential,
        is_vp_flag = EXCLUDED.is_vp_flag,
        description = EXCLUDED.description,
        category_meta = EXCLUDED.category_meta
    `;
    upserted++;
    if (upserted % 100 === 0) console.log(`  Upserted ${upserted}/${rows.length}...`);
  }

  console.log(`\nUpserted ${upserted} rows total`);
  const finalCount = await sql`SELECT COUNT(*) as n FROM attributes`;
  console.log(`Final DB row count: ${finalCount[0].n}`);
  const nullHub = await sql`SELECT COUNT(*) as n FROM attributes WHERE hub_label IS NULL OR hub_label = ''`;
  console.log(`Rows with empty hub_label: ${nullHub[0].n}`);

  await sql.end();
}

main().catch((e) => { console.error("Sync failed:", e); process.exit(1); });
