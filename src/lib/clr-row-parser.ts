/**
 * Per-SKU data-row extractor for Amazon Category Listing Report .xlsm files.
 * Targets the Listing API JSON-Schema template Amazon ships today: SKU
 * lives in `contribution_sku#1.value`, product type in
 * `product_type#1.value`. Row 6 (index 5) is Amazon's embedded "ABC123"
 * placeholder example — unconditionally skipped; real data starts at
 * row 7 (index 6). Uses Data Definitions for the requirement flag of
 * each attribute to compute required_complete.
 *
 * Distinct from category-report-parser.ts, which extracts the *schema*
 * (attribute definitions, valid values) for category_definitions writes.
 * Both parsers can be called against the same workbook.
 */
import * as XLSX from "xlsx";

export interface ParsedClrRow {
  sku: string;
  productType: string;
  attributes: Record<string, string>;
  requiredComplete: boolean;
}

export function parseClrRows(buffer: ArrayBuffer): ParsedClrRow[] {
  const wb = XLSX.read(buffer, { type: "array" });

  const requiredFields = parseRequiredFields(wb);

  const tmpl = wb.Sheets["Template"];
  if (!tmpl) throw new Error('Sheet "Template" not found');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(tmpl, { header: 1 });
  const headerRow = rows[4];
  if (!headerRow) {
    throw new Error("Template sheet missing API field-name header row");
  }
  const apiFields = headerRow.map((v) => cellStr(v));

  const skuRe = /^contribution_sku#1\.value$/;
  const ptRe = /^product_type#1\.value$/;
  const skuCol = apiFields.findIndex((f) => skuRe.test(f));
  const ptCol = apiFields.findIndex((f) => ptRe.test(f));
  if (skuCol < 0) {
    throw new Error(
      'Template sheet missing "contribution_sku#1.value" column'
    );
  }

  // Row 6 (Excel) / index 5 is Amazon's embedded "ABC123" example row.
  // Real data starts at row 7 / index 6. Always skip the example.
  const out: ParsedClrRow[] = [];
  for (let r = 6; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const sku = cellStr(row[skuCol]);
    if (!sku) continue;

    const attributes: Record<string, string> = {};
    for (let c = 0; c < apiFields.length; c++) {
      const field = apiFields[c];
      if (!field) continue;
      const val = cellStr(row[c]);
      if (val) attributes[field] = val;
    }

    const productType = ptCol >= 0 ? cellStr(row[ptCol]) || "UNKNOWN" : "UNKNOWN";
    const requiredComplete = requiredFields.every(
      (f) => (attributes[f] ?? "").trim() !== ""
    );

    out.push({ sku, productType, attributes, requiredComplete });
  }

  return out;
}

/**
 * Walk the Data Definitions sheet to collect amazon field names whose
 * Requirement column is "Required". Mirrors the parsing logic in
 * category-report-parser.ts but only collects what we need here.
 */
function parseRequiredFields(wb: XLSX.WorkBook): string[] {
  const ws = wb.Sheets["Data Definitions"];
  if (!ws) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const required: string[] = [];
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const colA = cellStr(row[0]);
    const colB = cellStr(row[1]);
    if (colA && !colB) continue; // group header row
    if (!colB) continue;
    const requirement = cellStr(row[5]).toLowerCase();
    if (requirement === "required") required.push(colB);
  }
  return required;
}

function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}
