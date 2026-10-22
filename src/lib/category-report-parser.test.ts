import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  applyTemplateColumnOrder,
  parseCategoryReport,
  parseTemplateColumns,
  type ParsedCategoryAttribute,
} from "./category-report-parser";

function attr(
  over: Partial<ParsedCategoryAttribute> & Pick<ParsedCategoryAttribute, "amazonFieldName" | "localLabel">
): ParsedCategoryAttribute {
  return {
    groupName: "Product Details",
    description: "",
    example: "",
    requirement: "Optional",
    validValues: [],
    sortOrder: 0,
    ...over,
  };
}

function clrWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Data Definitions"],
      ["Group", "Field", "Label", "Description", "Example", "Requirement"],
      ["Product Details", "", "", "", "", ""],
      [
        "",
        "color[marketplace_id=ATVPDKIKX0DER]#1.value",
        "Color",
        "Color name",
        "Red",
        "Required",
      ],
      [
        "",
        "size[marketplace_id=ATVPDKIKX0DER]#1.value",
        "Size",
        "",
        "",
        "Optional",
      ],
      ["Images", "", "", "", "", ""],
      [
        "",
        "main_product_image_locator[marketplace_id=ATVPDKIKX0DER]#1.media_location",
        "Main Image URL",
        "",
        "",
        "Required",
      ],
    ]),
    "Data Definitions"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Valid Values"],
      ["", "Product Type - [ ]", "SHOES"],
    ]),
    "Valid Values"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["settings"],
      ["Use ENGLISH"],
      [
        "Reference Group",
        "",
        "Listing Identity",
        "",
        "Images",
        "Product Details",
        "",
      ],
      [
        "Status",
        "Title",
        "SKU",
        "Product Type",
        "Main Image URL",
        "Color",
        "Size",
      ],
      [
        "::listing_status",
        "::title",
        "contribution_sku#1.value",
        "product_type#1.value",
        "main_product_image_locator[marketplace_id=ATVPDKIKX0DER]#1.media_location",
        "color[marketplace_id=ATVPDKIKX0DER]#1.value",
        "size[marketplace_id=ATVPDKIKX0DER]#1.value",
      ],
      ["example"],
    ]),
    "Template"
  );
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("applyTemplateColumnOrder", () => {
  it("reorders Data Definitions attributes to Template tab order and groups", () => {
    const dd = [
      attr({
        amazonFieldName: "color#1",
        localLabel: "Color",
        groupName: "Product Details",
        requirement: "Required",
        sortOrder: 0,
      }),
      attr({
        amazonFieldName: "size#1",
        localLabel: "Size",
        groupName: "Product Details",
        requirement: "Optional",
        sortOrder: 1,
      }),
      attr({
        amazonFieldName: "main_image#1",
        localLabel: "Main Image URL",
        groupName: "Images",
        requirement: "Required",
        sortOrder: 2,
      }),
    ];
    const ordered = applyTemplateColumnOrder(dd, [
      {
        amazonFieldName: "contribution_sku#1.value",
        localLabel: "SKU",
        groupName: "Listing Identity",
        sortOrder: 2,
      },
      {
        amazonFieldName: "main_image#1",
        localLabel: "Main Image URL",
        groupName: "Images",
        sortOrder: 4,
      },
      {
        amazonFieldName: "color#1",
        localLabel: "Color",
        groupName: "Product Details",
        sortOrder: 5,
      },
      {
        amazonFieldName: "size#1",
        localLabel: "Size",
        groupName: "Product Details",
        sortOrder: 6,
      },
    ]);

    expect(ordered.map((a) => a.localLabel)).toEqual([
      "SKU",
      "Main Image URL",
      "Color",
      "Size",
    ]);
    expect(ordered.map((a) => a.groupName)).toEqual([
      "Listing Identity",
      "Images",
      "Product Details",
      "Product Details",
    ]);
    expect(ordered[2].requirement).toBe("Required");
    expect(ordered[0].sortOrder).toBe(2);
  });

  it("does not append Data Definitions rows that the Template tab omitted", () => {
    const ordered = applyTemplateColumnOrder(
      [
        attr({
          amazonFieldName: "::listing_status",
          localLabel: "Status",
          groupName: "Reference Group",
          sortOrder: 0,
        }),
        attr({
          amazonFieldName: "color#1",
          localLabel: "Color",
          groupName: "Product Details",
          requirement: "Required",
          sortOrder: 1,
        }),
      ],
      [
        {
          amazonFieldName: "color#1",
          localLabel: "Color",
          groupName: "Product Details",
          sortOrder: 5,
        },
      ]
    );
    expect(ordered.map((a) => a.localLabel)).toEqual(["Color"]);
  });
});

describe("parseCategoryReport Template layout", () => {
  it("skips :: columns and uses Template tab order plus Data Definitions requirements", () => {
    const { reports } = parseCategoryReport(clrWorkbook());
    expect(reports).toHaveLength(1);
    expect(reports[0].productType).toBe("SHOES");
    expect(reports[0].attributes.map((a) => a.localLabel)).toEqual([
      "SKU",
      "Product Type",
      "Main Image URL",
      "Color",
      "Size",
    ]);
    expect(reports[0].attributes.map((a) => a.groupName)).toEqual([
      "Listing Identity",
      "Listing Identity",
      "Images",
      "Product Details",
      "Product Details",
    ]);
    expect(reports[0].attributes.find((a) => a.localLabel === "Color")?.requirement).toBe(
      "Required"
    );
    expect(
      reports[0].attributes.find((a) => a.localLabel === "Main Image URL")?.sortOrder
    ).toBe(4);
  });

  it("parses Template groups with fill-forward", () => {
    const wb = XLSX.read(clrWorkbook(), { type: "array" });
    const cols = parseTemplateColumns(wb);
    expect(cols.map((c) => c.localLabel)).toEqual([
      "SKU",
      "Product Type",
      "Main Image URL",
      "Color",
      "Size",
    ]);
    expect(cols[0].groupName).toBe("Listing Identity");
    expect(cols[2].groupName).toBe("Images");
  });
});
