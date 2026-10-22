/**
 * Parser for Amazon Category Listing Report XLSM files.
 *
 * Expected sheets:
 * - "Data Definitions": rows with group headers (col A only) and
 *   attribute rows (cols B–F: field name, local label, description, example, requirement)
 * - "Valid Values": rows where col B = "Label - [ PRODUCT_TYPE ]" and cols C+ = allowed values
 * - "Template": row 3 = groups, row 5 = Amazon API field names → extract product type from field names
 */

import * as XLSX from "xlsx";

export interface ParsedCategoryAttribute {
  amazonFieldName: string;
  localLabel: string;
  groupName: string;
  description: string;
  example: string;
  requirement: string;
  validValues: string[];
  sortOrder: number;
}

export interface ParsedCategoryReport {
  productType: string;
  marketplace: string;
  attributes: ParsedCategoryAttribute[];
  summary: {
    total: number;
    required: number;
    conditional: number;
    optional: number;
  };
}

export interface ParsedSnapshotRow {
  productType: string;
  asin: string;
  sku: string | null;
  parentage: string | null;
  values: Record<string, string>;
}

export interface ParseResult {
  reports: ParsedCategoryReport[];
  snapshots: ParsedSnapshotRow[];
}

export function parseCategoryReport(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array" });

  const attributes = applyTemplateColumnOrder(
    parseDataDefinitions(wb),
    parseTemplateColumns(wb)
  );
  const validValuesByType = parseValidValues(wb);
  const { productTypes, marketplace } = parseTemplate(wb, attributes);

  if (productTypes.length === 0) {
    throw new Error(
      "No product types could be resolved from the Valid Values sheet. " +
        "Expected a 'Product Type - [ ]' row or '[ PRODUCT_TYPE ]' label rows."
    );
  }

  const reports: ParsedCategoryReport[] = productTypes.map((pt) => {
    const vvForType = validValuesByType.get(pt) ?? new Map<string, string[]>();
    const perCategoryAttrs: ParsedCategoryAttribute[] = attributes.map((attr) => {
      const values = vvForType.get(attr.localLabel.toLowerCase()) ?? [];
      return { ...attr, validValues: values };
    });
    const summary = {
      total: perCategoryAttrs.length,
      required: perCategoryAttrs.filter((a) => a.requirement === "Required").length,
      conditional: perCategoryAttrs.filter(
        (a) => a.requirement === "Conditionally Required"
      ).length,
      optional: perCategoryAttrs.filter(
        (a) => a.requirement === "Optional" || a.requirement === "Recommended"
      ).length,
    };
    return { productType: pt, marketplace, attributes: perCategoryAttrs, summary };
  });

  const snapshots = parseTemplateSnapshot(wb, new Set(productTypes));

  return { reports, snapshots };
}

export interface TemplateColumn {
  amazonFieldName: string;
  localLabel: string;
  groupName: string;
  sortOrder: number;
}

/**
 * Template tab layout: row 3 = groups (sparse, fill-forward), row 4 = labels,
 * row 5 = Amazon API field names. `::` columns are Amazon feed metadata, not
 * listing attributes.
 */
export function parseTemplateColumns(wb: XLSX.WorkBook): TemplateColumn[] {
  const tmpl = wb.Sheets["Template"];
  if (!tmpl) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(tmpl, {
    header: 1,
    defval: "",
  });
  const groupRow = rows[2] ?? [];
  const labelRow = rows[3] ?? [];
  const fieldRow = rows[4] ?? [];
  const max = Math.max(groupRow.length, labelRow.length, fieldRow.length);

  const columns: TemplateColumn[] = [];
  let currentGroup = "";
  for (let c = 0; c < max; c++) {
    const groupCell = cellStr(groupRow[c]);
    if (groupCell) currentGroup = groupCell;
    const amazonFieldName = cellStr(fieldRow[c]);
    if (!amazonFieldName || amazonFieldName.startsWith("::")) continue;
    columns.push({
      amazonFieldName,
      localLabel: cellStr(labelRow[c]) || amazonFieldName,
      groupName: currentGroup,
      sortOrder: c,
    });
  }
  return columns;
}

/**
 * Prefer the Template tab's left-to-right order and group names. Data
 * Definitions still supplies requirement / description / example. Template-only
 * repeats (Bullet Point #2–#5, extra image slots) are kept so they can match
 * Hub fields like BulletPoint2. Data Definitions rows omitted from the Template
 * tab (including `::` feed metadata) are dropped.
 */
export function applyTemplateColumnOrder(
  ddAttrs: ParsedCategoryAttribute[],
  templateCols: TemplateColumn[]
): ParsedCategoryAttribute[] {
  if (templateCols.length === 0) return ddAttrs;

  const byField = new Map(ddAttrs.map((a) => [a.amazonFieldName, a]));
  const ordered: ParsedCategoryAttribute[] = [];

  for (const col of templateCols) {
    const dd = byField.get(col.amazonFieldName);
    if (dd) {
      ordered.push({
        ...dd,
        localLabel: col.localLabel || dd.localLabel,
        groupName: col.groupName || dd.groupName,
        sortOrder: col.sortOrder,
      });
    } else {
      ordered.push({
        amazonFieldName: col.amazonFieldName,
        localLabel: col.localLabel,
        groupName: col.groupName,
        description: "",
        example: "",
        requirement: "Optional",
        validValues: [],
        sortOrder: col.sortOrder,
      });
    }
  }

  return ordered;
}

/**
 * Parse the "Data Definitions" sheet.
 * Row 1: header text, Row 2: column labels, Row 3+: data.
 * Group headers: col A has a value, col B is empty.
 * Attribute rows: col B has the amazon field name.
 */
function parseDataDefinitions(
  wb: XLSX.WorkBook
): ParsedCategoryAttribute[] {
  const ws = wb.Sheets["Data Definitions"];
  if (!ws) throw new Error('Sheet "Data Definitions" not found');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const attributes: ParsedCategoryAttribute[] = [];
  let currentGroup = "";
  let sortOrder = 0;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const colA = cellStr(row[0]);
    const colB = cellStr(row[1]);

    if (colA && !colB) {
      currentGroup = colA.split(" - ")[0].trim();
      continue;
    }

    if (colB) {
      attributes.push({
        amazonFieldName: colB,
        localLabel: cellStr(row[2]) || colB,
        groupName: currentGroup,
        description: cellStr(row[3]),
        example: cellStr(row[4]),
        requirement: normalizeRequirement(cellStr(row[5])),
        validValues: [],
        sortOrder: sortOrder++,
      });
    }
  }

  return attributes;
}

function parseValidValues(
  wb: XLSX.WorkBook
): Map<string, Map<string, string[]>> {
  const result = new Map<string, Map<string, string[]>>();

  const validValuesSheets = wb.SheetNames.filter((name) =>
    /^Valid\s+Values/i.test(name)
  );

  for (const sheetName of validValuesSheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    for (const row of rows) {
      if (!row) continue;
      const colB = cellStr(row[1]);
      if (!colB) continue;

      const match = colB.match(/^(.+?)\s*-\s*\[\s*([A-Z0-9_]*)\s*\]\s*$/);
      if (!match) continue;

      const label = match[1].trim();
      const productType = match[2].trim();

      if (!productType) continue;

      const values: string[] = [];
      for (let c = 2; c < row.length; c++) {
        const v = cellStr(row[c]);
        if (v && !v.toLowerCase().includes("deprecated")) {
          values.push(v);
        }
      }
      if (values.length === 0) continue;

      if (!result.has(productType)) result.set(productType, new Map());
      result.get(productType)!.set(label.toLowerCase(), values);
    }
  }

  return result;
}

function parseTemplate(
  wb: XLSX.WorkBook,
  attributes: ParsedCategoryAttribute[]
): { productTypes: string[]; marketplace: string } {
  let marketplace = "ATVPDKIKX0DER";
  const productTypeSet = new Set<string>();

  for (const attr of attributes) {
    const mpMatch = attr.amazonFieldName.match(/marketplace_id=([A-Z0-9]+)/);
    if (mpMatch) {
      marketplace = mpMatch[1];
      break;
    }
  }

  const vvSheet = wb.Sheets["Valid Values"];
  if (!vvSheet) return { productTypes: [], marketplace };

  const vvRows: unknown[][] = XLSX.utils.sheet_to_json(vvSheet, { header: 1 });

  for (const row of vvRows) {
    if (!row) continue;
    const colB = cellStr(row[1]);
    if (!colB) continue;
    if (!/^Product\s+Type\s*-\s*\[\s*\]\s*$/i.test(colB)) continue;
    for (let c = 2; c < row.length; c++) {
      const v = cellStr(row[c]);
      if (v) productTypeSet.add(v.toUpperCase());
    }
    if (productTypeSet.size > 0) break;
  }

  if (productTypeSet.size === 0) {
    for (const row of vvRows) {
      if (!row) continue;
      const colB = cellStr(row[1]);
      if (!colB) continue;
      const ptMatch = colB.match(/\[\s*([A-Z0-9_]+)\s*\]/);
      if (ptMatch && ptMatch[1].trim()) {
        productTypeSet.add(ptMatch[1].trim().toUpperCase());
      }
    }
  }

  return { productTypes: [...productTypeSet], marketplace };
}

function parseTemplateSnapshot(
  wb: XLSX.WorkBook,
  authoritativeTypes: Set<string>
): ParsedSnapshotRow[] {
  const tmpl = wb.Sheets["Template"];
  if (!tmpl) return [];

  const rows: unknown[][] = XLSX.utils.sheet_to_json(tmpl, { header: 1 });
  const fieldNameRow = rows[4];
  if (!fieldNameRow) return [];

  const fieldNames = fieldNameRow.map((c) => cellStr(c));
  const colByField = (name: string): number =>
    fieldNames.findIndex((f) => f.toLowerCase() === name.toLowerCase());

  const asinCol = colByField("asin");
  const skuCol = colByField("item_sku") >= 0 ? colByField("item_sku") : colByField("sku");
  const parentageCol =
    colByField("parent_child") >= 0
      ? colByField("parent_child")
      : colByField("parentage_level");
  const productTypeCol =
    colByField("product_type") >= 0 ? colByField("product_type") : colByField("feed_product_type");

  if (productTypeCol < 0 || asinCol < 0) return [];

  const snapshots: ParsedSnapshotRow[] = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const rawPt = cellStr(row[productTypeCol]);
    if (!rawPt) continue;
    const pt = rawPt.toUpperCase();
    if (!authoritativeTypes.has(pt)) continue;

    const asin = cellStr(row[asinCol]);
    if (!asin) continue;

    const values: Record<string, string> = {};
    for (let c = 0; c < fieldNames.length; c++) {
      const field = fieldNames[c];
      if (!field) continue;
      const v = cellStr(row[c]);
      if (v) values[field] = v;
    }

    snapshots.push({
      productType: pt,
      asin,
      sku: skuCol >= 0 ? cellStr(row[skuCol]) || null : null,
      parentage: parentageCol >= 0 ? cellStr(row[parentageCol]) || null : null,
      values,
    });
  }

  return snapshots;
}

function cellStr(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function normalizeRequirement(raw: string): string {
  if (!raw) return "Optional";
  const lower = raw.toLowerCase();
  if (lower === "required") return "Required";
  if (lower.includes("conditional")) return "Conditionally Required";
  if (lower === "recommended") return "Recommended";
  return "Optional";
}
