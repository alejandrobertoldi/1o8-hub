import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import * as XLSX from "xlsx";
import path from "path";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, ssl: "require" });
  const rows = await sql`
    SELECT master_row, reference_group, subgroup, general_label,
           bq_label, sc_label, sc_label_multi, vc_label,
           alr_label, clr_label, sb_label,
           bq_data_type, label_max_options,
           is_essential, is_vp_flag, description,
           client_requirements, category_meta
    FROM attributes
    ORDER BY reference_group, subgroup, master_row
  `;
  await sql.end();

  const wb = XLSX.utils.book_new();

  // Sheet 1: full flat list
  const flat = rows.map((r) => ({
    master_row: r.master_row,
    reference_group: r.reference_group,
    subgroup: r.subgroup ?? "",
    general_label: r.general_label,
    bq_label: r.bq_label ?? "",
    sc_label: r.sc_label ?? "",
    sc_label_multi: r.sc_label_multi ?? "",
    vc_label: r.vc_label ?? "",
    alr_label: r.alr_label ?? "",
    clr_label: r.clr_label ?? "",
    sb_label: r.sb_label ?? "",
    bq_data_type: r.bq_data_type ?? "",
    label_max_options: r.label_max_options ?? "",
    is_essential: r.is_essential,
    is_vp_flag: r.is_vp_flag,
    description: r.description ?? "",
    client_requirements: JSON.stringify(r.client_requirements ?? {}).slice(0, 30000),
    category_meta: JSON.stringify(r.category_meta ?? {}).slice(0, 30000),
  }));
  const COLS = [8,22,20,32,30,30,16,28,22,22,22,12,14,12,12,50,30,30].map(w => ({ wch: w }));
  const ws1 = XLSX.utils.json_to_sheet(flat);
  ws1["!cols"] = COLS;
  XLSX.utils.book_append_sheet(wb, ws1, "All Attributes");

  // Sheet 2: pivot — one tab per reference_group
  const groups: Record<string, typeof flat> = {};
  for (const r of flat) {
    if (!groups[r.reference_group]) groups[r.reference_group] = [];
    groups[r.reference_group].push(r);
  }
  for (const [grp, grpRows] of Object.entries(groups)) {
    const sheetName = grp.slice(0, 31); // Excel tab limit
    const ws = XLSX.utils.json_to_sheet(grpRows);
    ws["!cols"] = COLS;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const outPath = path.resolve("docs/attributes-export.xlsx");
  XLSX.writeFile(wb, outPath);
  console.log(`Written: ${outPath} (${rows.length} rows, ${Object.keys(groups).length + 1} sheets)`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
