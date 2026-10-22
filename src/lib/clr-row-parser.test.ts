/* eslint-disable react-doctor/js-combine-iterations */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseClrRows } from "./clr-row-parser";

/**
 * Build a synthetic CLR .xlsm in memory. Mirrors Amazon's new Listing API
 * JSON-Schema template: header row at index 4 carries dotted/bracketed
 * field IDs (contribution_sku#1.value, item_name[marketplace_id=...]#1.value,
 * etc.). Index 5 is Amazon's "ABC123" placeholder example row that the
 * parser must always skip. Real data starts at index 6.
 *
 * The Data Definitions sheet uses the same new IDs in column B with a
 * Requirement column (F) of "Required" / "Optional".
 */
const SKU_FIELD = "contribution_sku#1.value";
const PT_FIELD = "product_type#1.value";
const ITEM_NAME_FIELD =
  "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value";
const BRAND_FIELD =
  "brand[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value";
const LIST_PRICE_FIELD = "list_price[marketplace_id=ATVPDKIKX0DER]#1.value";

interface SyntheticOpts {
  rows: Array<Record<string, string>>;
  required?: string[];
  /**
   * Optional placeholder row at template index 5 — Amazon's embedded
   * example row. If omitted, an empty row is written so the example slot
   * still exists and the parser skips it. Defaults to a SKU `ABC123` row.
   */
  exampleRow?: Record<string, string> | null;
}

function buildSyntheticClr(opts: SyntheticOpts): ArrayBuffer {
  const { rows, required = [], exampleRow } = opts;
  const wb = XLSX.utils.book_new();

  const apiFields = Object.keys(rows[0] ?? {});
  const example =
    exampleRow === undefined
      ? makeDefaultExample(apiFields)
      : exampleRow ?? {};

  const templateAoa: unknown[][] = [
    ["TEMPLATE"],
    [],
    apiFields.map(() => "Group"),
    apiFields.map((f) => labelize(f)),
    apiFields,
    apiFields.map((f) => example[f] ?? ""),
    ...rows.map((r) => apiFields.map((f) => r[f] ?? "")),
  ];
  const templateWs = XLSX.utils.aoa_to_sheet(templateAoa);
  XLSX.utils.book_append_sheet(wb, templateWs, "Template");

  const ddAoa: unknown[][] = [
    ["Data Definitions"],
    ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"],
    ["Group", "", "", "", "", ""],
    ...apiFields.map((f) => [
      "",
      f,
      labelize(f),
      "",
      "",
      required.includes(f) ? "Required" : "Optional",
    ]),
  ];
  const ddWs = XLSX.utils.aoa_to_sheet(ddAoa);
  XLSX.utils.book_append_sheet(wb, ddWs, "Data Definitions");

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return buf as ArrayBuffer;
}

function makeDefaultExample(apiFields: string[]): Record<string, string> {
  const example: Record<string, string> = {};
  for (const f of apiFields) {
    if (/^contribution_sku#1\.value$/.test(f)) example[f] = "ABC123";
    else if (/^product_type#1\.value$/.test(f)) example[f] = "EXAMPLE_PT";
    else example[f] = "EXAMPLE";
  }
  return example;
}

function labelize(apiField: string): string {
  return apiField
    .split(/[_\.\[\]=#]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

describe("parseClrRows", () => {
  it("extracts one row per data row with product_type as productType", () => {
    const buf = buildSyntheticClr({
      rows: [
        {
          [PT_FIELD]: "SHOES",
          [SKU_FIELD]: "SKU-1",
          [ITEM_NAME_FIELD]: "Red shoe",
          [BRAND_FIELD]: "Acme",
          [LIST_PRICE_FIELD]: "29.99",
        },
        {
          [PT_FIELD]: "SHOES",
          [SKU_FIELD]: "SKU-2",
          [ITEM_NAME_FIELD]: "Blue shoe",
          [BRAND_FIELD]: "Acme",
          [LIST_PRICE_FIELD]: "39.99",
        },
      ],
    });

    const result = parseClrRows(buf);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sku: "SKU-1",
      productType: "SHOES",
      attributes: {
        [ITEM_NAME_FIELD]: "Red shoe",
        [BRAND_FIELD]: "Acme",
        [LIST_PRICE_FIELD]: "29.99",
      },
    });
    expect(result[1].sku).toBe("SKU-2");
  });

  it("unconditionally skips the embedded ABC123 example row at index 5", () => {
    const buf = buildSyntheticClr({
      exampleRow: {
        [PT_FIELD]: "EXAMPLE_PT",
        [SKU_FIELD]: "ABC123",
        [ITEM_NAME_FIELD]: "Example Item",
        [BRAND_FIELD]: "ExampleBrand",
      },
      rows: [
        {
          [PT_FIELD]: "SHOES",
          [SKU_FIELD]: "SKU-1",
          [ITEM_NAME_FIELD]: "Red shoe",
          [BRAND_FIELD]: "Acme",
        },
      ],
    });

    const result = parseClrRows(buf);
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe("SKU-1");
    expect(result.find((r) => r.sku === "ABC123")).toBeUndefined();
  });

  it("computes required_complete=false when a required attribute is empty", () => {
    const buf = buildSyntheticClr({
      rows: [
        {
          [PT_FIELD]: "SHOES",
          [SKU_FIELD]: "SKU-1",
          [ITEM_NAME_FIELD]: "Red shoe",
          [BRAND_FIELD]: "",
        },
      ],
      required: [SKU_FIELD, BRAND_FIELD],
    });

    const result = parseClrRows(buf);
    expect(result).toHaveLength(1);
    expect(result[0].requiredComplete).toBe(false);
  });

  it("computes required_complete=true when all required attributes are present", () => {
    const buf = buildSyntheticClr({
      rows: [
        {
          [PT_FIELD]: "SHOES",
          [SKU_FIELD]: "SKU-1",
          [ITEM_NAME_FIELD]: "Red shoe",
          [BRAND_FIELD]: "Acme",
        },
      ],
      required: [SKU_FIELD, BRAND_FIELD],
    });

    const result = parseClrRows(buf);
    expect(result[0].requiredComplete).toBe(true);
  });

  it("groups rows from a multi-category file by product_type", () => {
    const buf = buildSyntheticClr({
      rows: [
        { [PT_FIELD]: "SHOES", [SKU_FIELD]: "SKU-1", [ITEM_NAME_FIELD]: "Shoe" },
        { [PT_FIELD]: "HATS", [SKU_FIELD]: "SKU-2", [ITEM_NAME_FIELD]: "Hat" },
      ],
    });

    const result = parseClrRows(buf);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.sku === "SKU-1")?.productType).toBe("SHOES");
    expect(result.find((r) => r.sku === "SKU-2")?.productType).toBe("HATS");
  });

  it("skips data rows missing contribution_sku#1.value", () => {
    const buf = buildSyntheticClr({
      rows: [
        { [PT_FIELD]: "SHOES", [SKU_FIELD]: "SKU-1", [ITEM_NAME_FIELD]: "Real" },
        { [PT_FIELD]: "SHOES", [SKU_FIELD]: "", [ITEM_NAME_FIELD]: "Phantom" },
      ],
    });

    const result = parseClrRows(buf);
    expect(result).toHaveLength(1);
    expect(result[0].sku).toBe("SKU-1");
  });
});
