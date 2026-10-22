/* eslint-disable react-doctor/js-combine-iterations */
/* eslint-disable react-doctor/js-flatmap-filter */
import { describe, it, expect } from "vitest";
import { buildCreateRequests, type TemplateConfig } from "./template-sheet-builder";

const fixture: TemplateConfig = {
  clientName: "Acme Co",
  generatedDate: "2026-04-20",
  serviceAccountEmail: "svc@project.iam.gserviceaccount.com",
  sheets: [
    {
      productType: "SHOES",
      attributes: [
        {
          id: 1,
          generalLabel: "Color",
          referenceGroup: "Appearance",
          description: null,
          example: null,
          requirement: "Required",
          validValues: ["Red", "Blue"],
          isKey: false,
          isEssential: false,
        },
        {
          id: 2,
          generalLabel: "Size",
          referenceGroup: "Appearance",
          description: null,
          example: null,
          requirement: "Recommended",
          validValues: null,
          isKey: false,
          isEssential: false,
        },
      ],
      products: [
        { name: "Runner A", asin: "B001", values: { Color: "Red", Size: "" } },
        { name: "Runner B", asin: "B002", values: { Color: "", Size: "10" } },
      ],
    },
  ],
};

describe("buildCreateRequests", () => {
  it("returns a title + non-empty requests array", () => {
    const out = buildCreateRequests(fixture);
    expect(out.title).toMatch(/Acme Co/);
    expect(out.title).toMatch(/2026-04-20/);
    expect(out.requests.length).toBeGreaterThan(10);
  });

  it("emits addSheet requests for Instructions + each category + Valid Values", () => {
    const out = buildCreateRequests(fixture);
    const addSheets = out.requests
      .map((r) => (r as { addSheet?: { properties?: { title?: string } } }).addSheet?.properties?.title)
      .filter(Boolean);
    expect(addSheets).toEqual(
      expect.arrayContaining(["Instructions", "SHOES", "Valid Values"])
    );
  });

  it("assigns unique sheetId to every addSheet", () => {
    const out = buildCreateRequests(fixture);
    const sheetIds = out.requests
      .map((r) => (r as { addSheet?: { properties?: { sheetId?: number } } }).addSheet?.properties?.sheetId)
      .filter((id): id is number => typeof id === "number");
    expect(new Set(sheetIds).size).toBe(sheetIds.length);
  });

  it("freezes top 5 rows and left 2 columns on every category data sheet", () => {
    const out = buildCreateRequests(fixture);
    const frozen = out.requests.filter(
      (r) =>
        (r as {
          updateSheetProperties?: { properties?: { gridProperties?: { frozenRowCount?: number } } };
        }).updateSheetProperties?.properties?.gridProperties?.frozenRowCount === 5
    );
    expect(frozen.length).toBeGreaterThan(0);
    expect(
      (frozen[0] as {
        updateSheetProperties?: { properties?: { gridProperties?: { frozenColumnCount?: number } } };
      }).updateSheetProperties?.properties?.gridProperties?.frozenColumnCount
    ).toBe(2);
  });

  it("includes a protected range that restricts editors to the service account", () => {
    const out = buildCreateRequests(fixture);
    const protects = out.requests
      .map((r) => (r as { addProtectedRange?: { protectedRange?: { editors?: { users?: string[] } } } }).addProtectedRange)
      .filter(Boolean);
    expect(protects.length).toBeGreaterThan(0);
    const users = protects[0]!.protectedRange?.editors?.users ?? [];
    expect(users).toContain("svc@project.iam.gserviceaccount.com");
  });

  it("emits data-validation requests for attributes with validValues", () => {
    const out = buildCreateRequests(fixture);
    const validations = out.requests.filter(
      (r) => (r as { setDataValidation?: unknown }).setDataValidation !== undefined
    );
    expect(validations.length).toBeGreaterThan(0);
  });

  it("hides the Valid Values sheet", () => {
    const out = buildCreateRequests(fixture);
    const hidden = out.requests.find(
      (r) =>
        (r as {
          updateSheetProperties?: { properties?: { title?: string; hidden?: boolean } };
        }).updateSheetProperties?.properties?.title === "Valid Values" &&
        (r as { updateSheetProperties?: { properties?: { hidden?: boolean } } }).updateSheetProperties?.properties?.hidden === true
    );
    expect(hidden).toBeDefined();
  });

  it("includes all attributes in the Attributes Index tab with checkbox validation", () => {
    const out = buildCreateRequests(fixture);
    const addSheets = out.requests
      .map((r) => (r as { addSheet?: { properties?: { title?: string } } }).addSheet?.properties?.title)
      .filter(Boolean);
    expect(addSheets).toContain("Attributes Index");
    const booleanCheckboxes = out.requests.filter(
      (r) =>
        (r as {
          setDataValidation?: { rule?: { condition?: { type?: string } } };
        }).setDataValidation?.rule?.condition?.type === "BOOLEAN"
    );
    expect(booleanCheckboxes.length).toBeGreaterThan(0);
  });

  it("hides helper columns G+H on the Attributes Index tab", () => {
    const out = buildCreateRequests(fixture);
    const indexAdd = out.requests.find(
      (r) =>
        (r as { addSheet?: { properties?: { title?: string } } }).addSheet?.properties?.title ===
        "Attributes Index"
    );
    expect(indexAdd).toBeDefined();
    const indexId = (indexAdd as {
      addSheet: { properties: { sheetId: number; gridProperties: { columnCount: number } } };
    }).addSheet.properties.sheetId;
    // Index tab grid must be 8 columns wide so helpers have room
    expect(
      (indexAdd as { addSheet: { properties: { gridProperties: { columnCount: number } } } })
        .addSheet.properties.gridProperties.columnCount
    ).toBe(8);
    const hideCols = out.requests.find((r) => {
      const u = (r as {
        updateDimensionProperties?: {
          range?: { sheetId?: number; dimension?: string; startIndex?: number; endIndex?: number };
          properties?: { hiddenByUser?: boolean };
        };
      }).updateDimensionProperties;
      return (
        u?.range?.sheetId === indexId &&
        u.range.dimension === "COLUMNS" &&
        u.range.startIndex === 6 &&
        u.range.endIndex === 8 &&
        u.properties?.hiddenByUser === true
      );
    });
    expect(hideCols).toBeDefined();
  });

  it("populates target sheet name + 1-based column index in G+H for visible attrs", () => {
    const out = buildCreateRequests(fixture);
    // Find the Index tab data updateCells (startRowIndex: 1, endColumnIndex: 8)
    const dataWrite = out.requests.find((r) => {
      const u = (r as {
        updateCells?: { range?: { startRowIndex?: number; endColumnIndex?: number } };
      }).updateCells;
      return u?.range?.startRowIndex === 1 && u.range.endColumnIndex === 8;
    }) as {
      updateCells: {
        rows: { values: { userEnteredValue: { stringValue?: string; numberValue?: number } }[] }[];
      };
    } | undefined;
    expect(dataWrite).toBeDefined();
    const firstRow = dataWrite!.updateCells.rows[0].values;
    // Fixture has 2 attributes ("Color" then "Size") sorted by Required first,
    // so Color (Required) → col 3, Size (Recommended) → col 4.
    expect(firstRow[0].userEnteredValue.stringValue).toBe("SHOES"); // category
    expect(firstRow[2].userEnteredValue.stringValue).toBe("Color"); // label
    expect(firstRow[6].userEnteredValue.stringValue).toBe("SHOES"); // target sheet
    expect(firstRow[6].userEnteredValue.stringValue).toBeTruthy();
    expect(firstRow[7].userEnteredValue.numberValue).toBe(3); // 1-based col C
    const secondRow = dataWrite!.updateCells.rows[1].values;
    expect(secondRow[2].userEnteredValue.stringValue).toBe("Size");
    expect(secondRow[7].userEnteredValue.numberValue).toBe(4); // col D
  });
});

describe("buildCreateRequests — useIdentityHeaders mode (Min+Necessary)", () => {
  const identityFixture: TemplateConfig = {
    clientName: "Acme Co",
    generatedDate: "2026-05-14",
    serviceAccountEmail: "svc@project.iam.gserviceaccount.com",
    sheets: [
      {
        productType: "SHOES",
        useIdentityHeaders: true,
        // Attribute order here mirrors getMinimumNecessaryAttributes output:
        // identity cols first (SKU, ASIN, ItemName, ProductType), then
        // Amazon-Required + Hub-Essential attrs.
        attributes: [
          { id: -1, generalLabel: "SKU", referenceGroup: "", requirement: null, validValues: null, description: null, example: null, isKey: false, isEssential: false },
          { id: -1, generalLabel: "ASIN", referenceGroup: "", requirement: null, validValues: null, description: null, example: null, isKey: false, isEssential: false },
          { id: -1, generalLabel: "ItemName", referenceGroup: "", requirement: null, validValues: null, description: null, example: null, isKey: false, isEssential: false },
          { id: -1, generalLabel: "ProductType", referenceGroup: "", requirement: null, validValues: null, description: null, example: null, isKey: false, isEssential: false },
          { id: 10, generalLabel: "Color", referenceGroup: "Appearance", requirement: "Required", validValues: ["Red", "Blue"], description: null, example: null, isKey: false, isEssential: false },
        ],
        products: Array.from({ length: 3 }, () => ({ name: "", asin: "", values: {} })),
      },
    ],
  };

  it("emits SKU as the first header cell and ASIN as the second, with no 'Product Name' cell", () => {
    const out = buildCreateRequests(identityFixture);
    // The header row is the updateCells request at row 4 on the SHOES sheet.
    const sheetAdd = out.requests.find(
      (r) => (r as { addSheet?: { properties?: { title?: string } } }).addSheet?.properties?.title === "SHOES"
    ) as { addSheet: { properties: { sheetId: number } } };
    const shoesId = sheetAdd.addSheet.properties.sheetId;
    const headerWrite = out.requests.find((r) => {
      const u = (r as {
        updateCells?: { range?: { sheetId?: number; startRowIndex?: number; endRowIndex?: number } };
      }).updateCells;
      return u?.range?.sheetId === shoesId && u.range.startRowIndex === 4 && u.range.endRowIndex === 5;
    }) as {
      updateCells: { rows: { values: { userEnteredValue: { stringValue?: string } }[] }[] };
    } | undefined;
    expect(headerWrite).toBeDefined();
    const headerCells = headerWrite!.updateCells.rows[0].values;
    const labels = headerCells.map((c) => c.userEnteredValue.stringValue);
    expect(labels[0]).toBe("SKU");
    expect(labels[1]).toBe("ASIN");
    expect(labels).not.toContain("Product Name");
    // Exactly 5 columns: 4 identity + 1 attr; no leading Product Name/ASIN dupe.
    expect(labels).toEqual(["SKU", "ASIN", "ItemName", "ProductType", "Color"]);
  });

  it("does NOT add a protected range that locks the leading columns", () => {
    const out = buildCreateRequests(identityFixture);
    const sheetAdd = out.requests.find(
      (r) => (r as { addSheet?: { properties?: { title?: string } } }).addSheet?.properties?.title === "SHOES"
    ) as { addSheet: { properties: { sheetId: number } } };
    const shoesId = sheetAdd.addSheet.properties.sheetId;
    const protect = out.requests.find(
      (r) =>
        (r as { addProtectedRange?: { protectedRange?: { range?: { sheetId?: number } } } })
          .addProtectedRange?.protectedRange?.range?.sheetId === shoesId
    );
    expect(protect).toBeUndefined();
  });

  it("emits data rows whose first cell is SKU (not product name) and whose cell count matches header width", () => {
    // Fixture has 4 identity cols + 1 attr = 5 columns total. The data-row
    // updateCells request at startRowIndex:5 must emit rows of exactly 5
    // cells each, with the first being the SKU value (empty here because
    // scope="new" yields blank products) — never the legacy Product Name.
    const out = buildCreateRequests(identityFixture);
    const sheetAdd = out.requests.find(
      (r) => (r as { addSheet?: { properties?: { title?: string } } }).addSheet?.properties?.title === "SHOES"
    ) as { addSheet: { properties: { sheetId: number } } };
    const shoesId = sheetAdd.addSheet.properties.sheetId;
    const dataWrite = out.requests.find((r) => {
      const u = (r as {
        updateCells?: {
          range?: { sheetId?: number; startRowIndex?: number; endColumnIndex?: number };
        };
      }).updateCells;
      return u?.range?.sheetId === shoesId && u.range.startRowIndex === 5;
    }) as {
      updateCells: {
        range: { endColumnIndex: number };
        rows: { values: { userEnteredValue: { stringValue?: string } }[] }[];
      };
    } | undefined;
    expect(dataWrite).toBeDefined();
    const totalCols = dataWrite!.updateCells.range.endColumnIndex;
    expect(totalCols).toBe(5);
    // Each data row must have exactly totalCols cells — no missing or extra.
    expect(dataWrite!.updateCells.rows.length).toBe(3); // 3 blank products
    for (const r of dataWrite!.updateCells.rows) {
      expect(r.values.length).toBe(totalCols);
    }
    // First cell of first row is the SKU value — blank for scope="new".
    // Critically: NOT a product name, which the legacy layout used here.
    expect(dataWrite!.updateCells.rows[0].values[0].userEnteredValue.stringValue).toBe("");
  });
});
