import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  asinSkuMarketplaceKey,
  clientSkuKey,
  normalizeMarketplace,
  parseProductImportRecords,
  planProductImport,
  recordsFromWorkbook,
  toBqRow,
  buildClientProductImportWorkbook,
  marketplaceFromId,
  classifyClrSkus,
  matchSkusToAlrAsins,
  applyAlrAsinsToImportRows,
  attachAlrAsins,
  extractClrSeoV0,
  applyClrSeoV0ToProduct,
  importOverwriteFields,
  PRODUCT_IMPORT_MAX_ROWS,
  type ImportRow,
} from "./product-excel-import";
import { mapBqRowToProduct } from "./product-mapper";

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    rowNumber: 2,
    sheet: "Products",
    asin: "B00TEST123",
    sku: "SKU-1",
    clientIdCode: "AAC",
    marketplace: "amazon.com",
    extra: {},
    ...overrides,
  };
}

function workbook(headers: string[], data: string[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

describe("normalizeMarketplace", () => {
  it("accepts canonical marketplace ids", () => {
    expect(normalizeMarketplace("amazon.com")).toBe("amazon.com");
    expect(normalizeMarketplace("Amazon.CA")).toBe("amazon.ca");
  });

  it("maps country aliases", () => {
    expect(normalizeMarketplace("US")).toBe("amazon.com");
    expect(normalizeMarketplace("UK")).toBe("amazon.co.uk");
    expect(normalizeMarketplace("Japan")).toBe("amazon.co.jp");
  });

  it("returns null for unknown values", () => {
    expect(normalizeMarketplace("ebay")).toBeNull();
    expect(normalizeMarketplace("")).toBeNull();
  });
});

describe("parseProductImportRecords", () => {
  it("parses BQ-named headers", () => {
    const result = parseProductImportRecords([
      {
        ASIN: "b00test123",
        SKU: "SKU-1",
        ClientIDCode: "AAC",
        Marketplace: "amazon.com",
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      rowNumber: 2,
      asin: "B00TEST123",
      sku: "SKU-1",
      clientIdCode: "AAC",
      marketplace: "amazon.com",
    });
  });

  it("accepts export-style headers (Client Code)", () => {
    const result = parseProductImportRecords([
      {
        "Client Code": "AAC",
        ASIN: "B00TEST123",
        SKU: "SKU-1",
        Marketplace: "US",
      },
    ]);
    expect(result.errors).toEqual([]);
    expect(result.valid[0].clientIdCode).toBe("AAC");
    expect(result.valid[0].marketplace).toBe("amazon.com");
  });

  it("skips fully blank rows", () => {
    const result = parseProductImportRecords([
      { ASIN: "", SKU: "", ClientIDCode: "", Marketplace: "" },
      {
        ASIN: "B00TEST123",
        SKU: "SKU-1",
        ClientIDCode: "AAC",
        Marketplace: "amazon.com",
      },
    ]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].rowNumber).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it("rejects a short ASIN", () => {
    const result = parseProductImportRecords([
      {
        ASIN: "B00SHORT",
        SKU: "SKU-1",
        ClientIDCode: "AAC",
        Marketplace: "amazon.com",
      },
    ]);
    expect(result.valid).toEqual([]);
    expect(result.errors[0]).toMatchObject({
      row: 2,
      message: "ASIN must be exactly 10 characters (8/10)",
    });
  });

  it("reports missing required fields", () => {
    const result = parseProductImportRecords([
      { ASIN: "B00TEST123", SKU: "", ClientIDCode: "AAC", Marketplace: "" },
    ]);
    expect(result.errors[0].message).toBe("Missing SKU, Marketplace");
  });

  it("maps extra core columns onto the BQ row", () => {
    const result = parseProductImportRecords([
      {
        ASIN: "B00TEST123",
        SKU: "SKU-1",
        ClientIDCode: "AAC",
        Marketplace: "amazon.com",
        Brand: "Acme",
        "Item Name": "Widget",
      },
    ]);
    expect(result.valid[0].extra).toMatchObject({
      BrandName: "Acme",
      ItemName: "Widget",
    });
  });

  it("skips template placeholder rows that only have Marketplace and ProductType", () => {
    const result = parseProductImportRecords(
      [
        {
          ASIN: "",
          SKU: "",
          Marketplace: "amazon.com",
          ProductType: "SHOES",
        },
        {
          ASIN: "B00TEST123",
          SKU: "SKU-1",
          Marketplace: "amazon.com",
          ProductType: "SHOES",
        },
      ],
      { defaultClientIdCode: "AAC" }
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].asin).toBe("B00TEST123");
  });

  it("maps Hub generalLabel headers via headerToBq", () => {
    const result = parseProductImportRecords(
      [
        {
          ASIN: "B00TEST123",
          SKU: "SKU-1",
          Marketplace: "amazon.com",
          "Bullet Point 1": "Durable",
        },
      ],
      {
        defaultClientIdCode: "AAC",
        headerToBq: { bulletpoint1: "BulletPoint1" },
      }
    );
    expect(result.valid[0].extra.BulletPoint1).toBe("Durable");
  });

  it("rejects files over the row cap", () => {
    const records = Array.from({ length: PRODUCT_IMPORT_MAX_ROWS + 1 }, () => ({
      ASIN: "B00TEST123",
      SKU: "SKU-1",
      ClientIDCode: "AAC",
      Marketplace: "amazon.com",
    }));
    const result = parseProductImportRecords(records);
    expect(result.valid).toEqual([]);
    expect(result.errors[0].message).toContain("maximum is 500");
  });
});

describe("recordsFromWorkbook", () => {
  it("reads the first sheet into string records", () => {
    const buf = workbook(
      ["ASIN", "SKU", "ClientIDCode", "Marketplace"],
      [["B00TEST123", "SKU-1", "AAC", "amazon.com"]]
    );
    const records = recordsFromWorkbook(buf);
    expect(records).toEqual([
      {
        sheet: "Products",
        rowNumber: 2,
        values: {
          ASIN: "B00TEST123",
          SKU: "SKU-1",
          ClientIDCode: "AAC",
          Marketplace: "amazon.com",
        },
      },
    ]);
  });

  it("skips the Instructions tab and uses the attribute header row", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Product import — AAC"]]),
      "Instructions"
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["", "", "", "", "Appearance"],
        ["Required", "Required", "Required", "", "Required"],
        ["ASIN", "SKU", "Marketplace", "ProductType", "Color"],
        ["B00TEST123", "SKU-1", "amazon.com", "SHOES", "Red"],
      ]),
      "SHOES"
    );
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const records = recordsFromWorkbook(buf);
    expect(records).toHaveLength(1);
    expect(records[0].sheet).toBe("SHOES");
    expect(records[0].rowNumber).toBe(4);
    expect(records[0].values.Color).toBe("Red");
  });
});

describe("planProductImport", () => {
  const clients = new Set(["AAC"]);

  it("queues new rows for insert", () => {
    const plan = planProductImport(
      [row()],
      { byAsinSkuMarketplace: new Set(), byClientSku: new Set() },
      clients
    );
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.skipped).toEqual([]);
    expect(plan.errors).toEqual([]);
  });

  it("canonicalizes client casing", () => {
    const plan = planProductImport(
      [row({ clientIdCode: "aac" })],
      { byAsinSkuMarketplace: new Set(), byClientSku: new Set() },
      clients
    );
    expect(plan.toInsert[0].clientIdCode).toBe("AAC");
  });

  it("errors on unknown clients", () => {
    const plan = planProductImport(
      [row({ clientIdCode: "NOPE" })],
      { byAsinSkuMarketplace: new Set(), byClientSku: new Set() },
      clients
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.errors[0].message).toBe('Unknown client "NOPE"');
  });

  it("skips existing ASIN+SKU+Marketplace", () => {
    const plan = planProductImport(
      [row()],
      {
        byAsinSkuMarketplace: new Set([
          asinSkuMarketplaceKey("B00TEST123", "SKU-1", "amazon.com"),
        ]),
        byClientSku: new Set(),
      },
      clients
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.skipped[0].reason).toBe("duplicate");
  });

  it("skips existing client+SKU", () => {
    const plan = planProductImport(
      [row()],
      {
        byAsinSkuMarketplace: new Set(),
        byClientSku: new Set([clientSkuKey("AAC", "SKU-1")]),
      },
      clients
    );
    expect(plan.skipped[0].message).toContain("SKU already exists");
  });

  it("queues existing SKUs for overwrite when the user selects them", () => {
    const plan = planProductImport(
      [row()],
      {
        byAsinSkuMarketplace: new Set(),
        byClientSku: new Set([clientSkuKey("AAC", "SKU-1")]),
      },
      clients,
      ["sku-1"]
    );
    expect(plan.toInsert).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.toOverwrite).toEqual([expect.objectContaining({ sku: "SKU-1" })]);
  });

  it("leaves unselected existing SKUs skipped", () => {
    const plan = planProductImport(
      [row()],
      {
        byAsinSkuMarketplace: new Set(),
        byClientSku: new Set([clientSkuKey("AAC", "SKU-1")]),
      },
      clients,
      []
    );
    expect(plan.toOverwrite).toEqual([]);
    expect(plan.skipped).toHaveLength(1);
  });

  it("errors on in-file duplicates", () => {
    const plan = planProductImport(
      [row({ rowNumber: 2 }), row({ rowNumber: 3 })],
      { byAsinSkuMarketplace: new Set(), byClientSku: new Set() },
      clients
    );
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.errors[0]).toMatchObject({
      row: 3,
      message: "Duplicate of another row in this file",
    });
  });
});

describe("toBqRow", () => {
  it("fills identity columns and country", () => {
    expect(toBqRow(row({ extra: { BrandName: "Acme" } }))).toEqual({
      ASIN: "B00TEST123",
      SKU: "SKU-1",
      ClientIDCode: "AAC",
      Marketplace: "amazon.com",
      Country: "US",
      BrandName: "Acme",
    });
  });
});

describe("marketplaceFromId", () => {
  it("maps Amazon marketplace ids to catalog domains", () => {
    expect(marketplaceFromId("ATVPDKIKX0DER")).toBe("amazon.com");
    expect(marketplaceFromId("A1F83G8C2ARO7P")).toBe("amazon.co.uk");
  });
});

describe("buildClientProductImportWorkbook", () => {
  it("builds one tab per category with identity + CLR attributes", () => {
    const buf = buildClientProductImportWorkbook({
      clientIdCode: "AAC",
      sheets: [
        {
          productType: "SHOES",
          marketplace: "amazon.com",
          attributes: [
            {
              generalLabel: "Color",
              referenceGroup: "Appearance",
              requirement: "Required",
              isKey: false,
            },
            {
              generalLabel: "Size",
              referenceGroup: "Appearance",
              requirement: "Optional",
              isKey: false,
            },
            {
              generalLabel: "ASIN",
              referenceGroup: "",
              requirement: "Required",
              isKey: false,
            },
          ],
        },
      ],
    });
    const records = recordsFromWorkbook(buf);
    expect(records.length).toBeGreaterThan(0);
    expect(records[0].sheet).toBe("SHOES");
    expect(records[0].values.Marketplace).toBe("amazon.com");
    expect(records[0].values.ProductType).toBe("SHOES");
    expect(Object.keys(records[0].values)).toEqual(
      expect.arrayContaining(["ASIN", "SKU", "Marketplace", "ProductType", "Color", "Size"])
    );
    expect(Object.keys(records[0].values).filter((k) => k === "ASIN")).toHaveLength(1);
  });

  it("keeps CLR Template tab order and groups instead of sorting by requirement", () => {
    const buf = buildClientProductImportWorkbook({
      clientIdCode: "AAC",
      sheets: [
        {
          productType: "SHOES",
          marketplace: "amazon.com",
          attributes: [
            {
              generalLabel: "Color",
              referenceGroup: "Appearance",
              groupName: "Product Details",
              requirement: "Required",
              isKey: false,
              sortOrder: 8,
            },
            {
              generalLabel: "SKU",
              referenceGroup: "Identity",
              groupName: "Listing Identity",
              requirement: "Required",
              isKey: false,
              sortOrder: 2,
            },
            {
              generalLabel: "ProductType",
              referenceGroup: "Identity",
              groupName: "Listing Identity",
              requirement: "Required",
              isKey: false,
              sortOrder: 3,
            },
            {
              generalLabel: "MainImageUrl",
              referenceGroup: "Media",
              groupName: "Images",
              requirement: "Optional",
              isKey: false,
              sortOrder: 5,
            },
          ],
        },
      ],
    });
    const wb = XLSX.read(buf, { type: "array" });
    const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.SHOES, {
      header: 1,
      defval: "",
    });
    expect(aoa[2]).toEqual([
      "ASIN",
      "Marketplace",
      "SKU",
      "ProductType",
      "MainImageUrl",
      "Color",
    ]);
    expect(aoa[0]).toEqual([
      "Listing Identity",
      "Listing Identity",
      "Listing Identity",
      "Listing Identity",
      "Images",
      "Product Details",
    ]);
  });
});

function clrWorkbook(
  listings: Array<{
    sku: string;
    productType: string;
    productId?: string;
    productIdType?: string;
    itemName?: string;
    title?: string;
    description?: string;
    bullets?: string[];
    keywords?: string[];
    asin?: string;
  }>,
  opts: { asinHeader?: string | false; includeDataDefinitions?: boolean } = {}
): Uint8Array {
  const wb = XLSX.utils.book_new();
  if (opts.includeDataDefinitions !== false) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Data Definitions"]]),
      "Data Definitions"
    );
  }
  const labels = [
    "Status",
    "Title",
    "SKU",
    "Product Type",
    "Product Id Type",
    "Product Id",
    "Item Name",
    "Product Description",
    "Bullet Point",
    "Bullet Point",
    "Bullet Point",
    "Bullet Point",
    "Bullet Point",
    "Generic Keywords",
    "Generic Keywords",
    "Generic Keywords",
    "Generic Keywords",
    "Generic Keywords",
  ];
  const fields = [
    "::listing_status",
    "::title",
    "contribution_sku#1.value",
    "product_type#1.value",
    "amzn1.volt.ca.product_id_type",
    "amzn1.volt.ca.product_id_value",
    "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value",
    "product_description[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value",
    "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value",
    "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#2.value",
    "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#3.value",
    "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#4.value",
    "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#5.value",
    "generic_keyword[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value",
    "generic_keyword[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#2.value",
    "generic_keyword[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#3.value",
    "generic_keyword[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#4.value",
    "generic_keyword[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#5.value",
  ];
  const insertAsinCol = listings.some((row) => row.asin) || opts.asinHeader !== undefined;
  let aoa: string[][] = [
    ["settings"],
    ["Use ENGLISH"],
    ["Reference Group", "", "Listing Identity", "", "Product Identity", "", ""],
    labels,
    fields,
    [
      "Active",
      "Amazon example",
      "ABC123",
      "ACCESSORY",
      "UPC",
      "714532191586",
      "Example",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ],
    ...listings.map((row) => [
      "Active",
      row.title ?? row.itemName ?? row.sku,
      row.sku,
      row.productType,
      row.productIdType ?? "UPC",
      row.productId ?? "",
      row.itemName ?? "",
      row.description ?? "",
      row.bullets?.[0] ?? "",
      row.bullets?.[1] ?? "",
      row.bullets?.[2] ?? "",
      row.bullets?.[3] ?? "",
      row.bullets?.[4] ?? "",
      row.keywords?.[0] ?? "",
      row.keywords?.[1] ?? "",
      row.keywords?.[2] ?? "",
      row.keywords?.[3] ?? "",
      row.keywords?.[4] ?? "",
    ]),
  ];
  if (insertAsinCol) {
    const header = opts.asinHeader === false ? "" : (opts.asinHeader ?? "ASIN");
    aoa = aoa.map((row, i) => {
      if (i === 3) return [header, ...row];
      if (i <= 5) return ["", ...row];
      const listing = listings[i - 6];
      return [listing?.asin ?? "", ...row];
    });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Template");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
}

describe("CLR listing import", () => {
  it("reads Template tab SKUs and skips the Amazon example row", () => {
    const records = recordsFromWorkbook(
      clrWorkbook([
        { sku: "850012616382", productType: "DRINK_FLAVORED", productId: "850012616382" },
        { sku: "Hydrate-Parent", productType: "DRINK_FLAVORED" },
      ])
    );
    expect(records.map((r) => r.values.SKU)).toEqual([
      "850012616382",
      "Hydrate-Parent",
    ]);
    expect(records[0].values.Marketplace).toBe("amazon.com");
    expect(records[0].values.ProductType).toBe("DRINK_FLAVORED");
    expect(records.every((r) => r.values.SKU !== "ABC123")).toBe(true);
  });

  it("accepts CLR rows without ASIN when requireAsin is false", () => {
    const records = recordsFromWorkbook(
      clrWorkbook([{ sku: "850012616382", productType: "DRINK_FLAVORED" }])
    );
    const parsed = parseProductImportRecords(records, {
      defaultClientIdCode: "PUR_SC_US",
      requireAsin: false,
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0]).toMatchObject({
      sku: "850012616382",
      asin: "",
      clientIdCode: "PUR_SC_US",
      marketplace: "amazon.com",
    });
  });

  it("uses Product Id as ASIN when the CLR type is ASIN", () => {
    const records = recordsFromWorkbook(
      clrWorkbook([
        {
          sku: "CHILD-1",
          productType: "SHOES",
          productIdType: "ASIN",
          productId: "B00TEST123",
        },
      ])
    );
    expect(records[0].values.ASIN).toBe("B00TEST123");
  });

  it("reads ASINs from an inserted column A, even without an ASIN header", () => {
    const records = recordsFromWorkbook(
      clrWorkbook(
        [{ sku: "SKU-1", productType: "PET_SUPPLIES", asin: "B00TEST123" }],
        { asinHeader: false }
      )
    );
    expect(records[0].values).toMatchObject({
      SKU: "SKU-1",
      ASIN: "B00TEST123",
    });
  });

  it("reads ASINs from column A when the header is labeled ASIN", () => {
    const records = recordsFromWorkbook(
      clrWorkbook(
        [{ sku: "SKU-1", productType: "PET_SUPPLIES", asin: "b00test123" }],
        { asinHeader: "ASIN" }
      )
    );
    expect(records[0].values.ASIN).toBe("B00TEST123");
  });

  it("detects a Template tab even if Data Definitions was removed", () => {
    const records = recordsFromWorkbook(
      clrWorkbook(
        [{ sku: "SKU-1", productType: "PET_SUPPLIES", asin: "B00TEST123" }],
        { includeDataDefinitions: false }
      )
    );
    expect(records).toHaveLength(1);
    expect(records[0].values.SKU).toBe("SKU-1");
  });
});

describe("classifyClrSkus", () => {
  it("splits file SKUs into already-in-Hub vs missing", () => {
    expect(
      classifyClrSkus(["SKU-1", "sku-1", "SKU-2"], ["SKU-1", "SKU-9"])
    ).toEqual({
      existing: ["SKU-1"],
      missing: ["SKU-2"],
    });
  });
});

describe("ALR SKU to ASIN match", () => {
  it("matches CLR SKUs to ALR asin1 case-insensitively", () => {
    expect(
      matchSkusToAlrAsins(
        ["SKU-1", "sku-1", "SKU-2"],
        [
          { sellerSku: "sku-1", asin1: "B00TEST123" },
          { sellerSku: "SKU-9", asin1: "B00OTHER99" },
        ]
      )
    ).toEqual({
      matched: [{ sku: "SKU-1", asin: "B00TEST123" }],
      unmatched: ["SKU-2"],
    });
  });

  it("keeps the first valid 10-character ASIN per SKU", () => {
    expect(
      matchSkusToAlrAsins(
        ["SKU-1"],
        [
          { sellerSku: "SKU-1", asin1: "SHORT" },
          { sellerSku: "SKU-1", asin1: "B00FIRST12" },
          { sellerSku: "SKU-1", asin1: "B00SECOND1" },
        ]
      )
    ).toEqual({
      matched: [{ sku: "SKU-1", asin: "B00FIRST12" }],
      unmatched: [],
    });
  });

  it("fills missing ASINs from ALR and skips unmatched SKUs", () => {
    const rows: ImportRow[] = [
      row({ sku: "HAS-ASIN", asin: "B00ALREAD1" }),
      row({ sku: "NEED-ALR", asin: "", rowNumber: 3 }),
      row({ sku: "NO-MATCH", asin: "", rowNumber: 4 }),
    ];
    const applied = applyAlrAsinsToImportRows(
      rows,
      new Map([
        ["need-alr", "B00FROMAL1"],
        ["has-asin", "B00SHOULD1"],
      ])
    );
    expect(applied.withAsin).toEqual([
      expect.objectContaining({ sku: "HAS-ASIN", asin: "B00ALREAD1" }),
      expect.objectContaining({ sku: "NEED-ALR", asin: "B00FROMAL1" }),
    ]);
    expect(applied.unmatched).toEqual([
      expect.objectContaining({ sku: "NO-MATCH" }),
    ]);
  });

  it("records unmatched CLR SKUs as no_asin skips", () => {
    const attached = attachAlrAsins(
      [row({ sku: "CLR-ONLY", asin: "" })],
      [{ sellerSku: "OTHER", asin1: "B00TEST123" }]
    );
    expect(attached.rows).toEqual([]);
    expect(attached.skipped).toEqual([
      {
        row: 2,
        sheet: "Products",
        message: "No ASIN in All Listings Report for this SKU",
        reason: "no_asin",
      },
    ]);
  });
});

describe("extractClrSeoV0", () => {
  it("maps Amazon field IDs onto Hub SEO version 0 fields", () => {
    expect(
      extractClrSeoV0({
        "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value":
          "Hydrate Lemon 12ct",
        "product_description[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value":
          "Daily hydration mix.",
        "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value":
          "Bullet one",
        "bullet_point[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#5.value":
          "Bullet five",
        "generic_keyword[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value":
          "electrolytes",
        "generic_keyword[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#2.value":
          "hydration",
      })
    ).toEqual({
      ItemName: "Hydrate Lemon 12ct",
      ProductDescription: "Daily hydration mix.",
      DetailedBulletPoint1: "Bullet one",
      DetailedBulletPoint5: "Bullet five",
      GenericKeyword1: "electrolytes",
      GenericKeyword2: "hydration",
    });
  });

  it("maps CLR labels including numbered bullets and keywords", () => {
    expect(
      extractClrSeoV0({
        "Item Name": "From Item Name",
        Title: "From Title",
        "Product Description": "Desc",
        "Bullet Point#1": "B1",
        "Bullet Point#2": "B2",
        "Bullet Point#3": "B3",
        "Bullet Point#4": "B4",
        "Bullet Point#5": "B5",
        "Generic Keywords #1": "k1",
        "Generic Keywords #2": "k2",
        "Generic Keywords #3": "k3",
        "Generic Keywords #4": "k4",
        "Generic Keywords #5": "k5",
      })
    ).toMatchObject({
      ItemName: "From Item Name",
      ProductDescription: "Desc",
      DetailedBulletPoint1: "B1",
      DetailedBulletPoint2: "B2",
      DetailedBulletPoint3: "B3",
      DetailedBulletPoint4: "B4",
      DetailedBulletPoint5: "B5",
      GenericKeyword1: "k1",
      GenericKeyword2: "k2",
      GenericKeyword3: "k3",
      GenericKeyword4: "k4",
      GenericKeyword5: "k5",
    });
  });

  it("uses Title when Item Name is empty", () => {
    expect(extractClrSeoV0({ Title: "Amazon title", "::title": "Also title" })).toEqual({
      ItemName: "Amazon title",
    });
  });

  it("reads repeated unlabeled Bullet Point / Generic Keywords columns in order", () => {
    expect(
      extractClrSeoV0({
        "Bullet Point": "First",
        "Bullet Point 2": "Second",
        "Generic Keywords": "alpha",
        "Generic Keywords 2": "beta",
      })
    ).toMatchObject({
      DetailedBulletPoint1: "First",
      DetailedBulletPoint2: "Second",
      GenericKeyword1: "alpha",
      GenericKeyword2: "beta",
    });
  });

  it("puts inherited copy on contentSeo as version 0 without using otherAttributes", () => {
    const seo = extractClrSeoV0({
      "Item Name": "Widget Title",
      "Product Description": "A widget.",
      "Bullet Point#1": "Durable",
      "Generic Keywords #1": "widget",
    });
    const product = applyClrSeoV0ToProduct(
      mapBqRowToProduct({
        ASIN: "B00TEST123",
        SKU: "SKU-1",
        ClientIDCode: "AAC",
        Marketplace: "amazon.com",
      }),
      seo
    );
    expect(product.itemName).toBe("Widget Title");
    expect(product.contentSeo).toMatchObject({
      ProductDescription: "A widget.",
      DetailedBulletPoint1: "Durable",
      GenericKeyword1: "widget",
      SEOVersionNumber: "0",
    });
    expect(product.otherAttributes?.DetailedBulletPoint1).toBeUndefined();
    expect(product.rawColumnValues).toMatchObject({
      ItemName: "Widget Title",
      SEOVersionNumber: "0",
    });
  });

  it("keeps variation links out of overwrite payloads", () => {
    const product = applyClrSeoV0ToProduct(
      mapBqRowToProduct({
        ASIN: "B00TEST123",
        SKU: "SKU-1",
        ClientIDCode: "AAC",
        Marketplace: "amazon.com",
        ItemName: "Widget",
      }),
      { ItemName: "Widget" }
    );
    const fields = importOverwriteFields({
      ...product,
      id: "keep-me",
      variationGroup: "Gummies",
      isVp: true,
    });
    expect(fields.id).toBeUndefined();
    expect(fields.variationGroup).toBeUndefined();
    expect(fields.isVp).toBeUndefined();
    expect(fields.itemName).toBe("Widget");
    expect(fields.isDirty).toBe(true);
  });
});

describe("CLR listing import SEO version 0", () => {
  it("extracts inherited listing copy from a Category Listing Report", () => {
    const records = recordsFromWorkbook(
      clrWorkbook([
        {
          sku: "AR12PCK",
          productType: "GROCERY",
          asin: "B00TEST123",
          itemName: "Hydrate Lemon 12ct",
          title: "Hydrate Lemon 12ct Title",
          description: "Daily hydration mix.",
          bullets: ["B1", "B2", "B3", "B4", "B5"],
          keywords: ["k1", "k2", "k3", "k4", "k5"],
        },
      ])
    );
    const parsed = parseProductImportRecords(records, {
      defaultClientIdCode: "HAL_SC_US",
    });
    expect(parsed.valid[0].seoV0).toEqual({
      ItemName: "Hydrate Lemon 12ct",
      ProductDescription: "Daily hydration mix.",
      DetailedBulletPoint1: "B1",
      DetailedBulletPoint2: "B2",
      DetailedBulletPoint3: "B3",
      DetailedBulletPoint4: "B4",
      DetailedBulletPoint5: "B5",
      GenericKeyword1: "k1",
      GenericKeyword2: "k2",
      GenericKeyword3: "k3",
      GenericKeyword4: "k4",
      GenericKeyword5: "k5",
    });
  });
});
