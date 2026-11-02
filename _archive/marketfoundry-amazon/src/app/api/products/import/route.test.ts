// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(),
}));

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockInsertSeo = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock("@/lib/bigquery", () => ({
  insertInheritedSeoVersions: (...args: unknown[]) => mockInsertSeo(...args),
}));

import { getAuthSession } from "@/lib/auth-db";
import { POST } from "./route";

const asMock = getAuthSession as unknown as ReturnType<typeof vi.fn>;

function xlsxFile(
  headers: string[],
  rows: string[][],
  name = "products.xlsx"
): File {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return new File([buf as BlobPart], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function clrFile(
  listings: Array<{
    sku: string;
    productType: string;
    asin?: string;
    itemName?: string;
    description?: string;
    bullets?: string[];
    keywords?: string[];
  }>
): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Data Definitions"]]),
    "Data Definitions"
  );
  const labels = [
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
  const aoa: string[][] = [
    ["", "settings"],
    ["", "Use ENGLISH"],
    ["", "Listing Identity", "Listing Identity", "Product Identity", "Product Identity"],
    ["ASIN", ...labels],
    ["", ...fields],
    ["", "ABC123", "ACCESSORY", "UPC", "714532191586", "Example", "", "", "", "", "", "", "", "", "", "", ""],
    ...listings.map((row) => [
      row.asin ?? "",
      row.sku,
      row.productType,
      "UPC",
      "",
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
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Template");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;
  return new File([buf as BlobPart], "clr.xlsm", {
    type: "application/vnd.ms-excel.sheet.macroEnabled.12",
  });
}

function formRequest(opts: {
  file?: File;
  clientIdCode?: string;
  mode?: string;
  overwriteSkus?: string[];
} = {}): NextRequest {
  const form = new FormData();
  if (opts.file) form.append("file", opts.file);
  if (opts.clientIdCode) form.append("clientIdCode", opts.clientIdCode);
  if (opts.mode) form.append("mode", opts.mode);
  if (opts.overwriteSkus) {
    form.append("overwriteSkus", JSON.stringify(opts.overwriteSkus));
  }
  return new NextRequest("http://localhost/api/products/import", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/products/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock.mockResolvedValue({
      user: { email: "tester@example.com", role: "editor" },
    });

    mockSelect.mockImplementation(() => {
      const rows = [{ code: "AAC", generalLabel: "Color", bqLabel: "Color" }];
      const resolved = Promise.resolve(rows);
      return {
        from: () => ({
          where: () => Promise.resolve([]),
          orderBy: () => resolved,
          then: resolved.then.bind(resolved),
          catch: resolved.catch.bind(resolved),
        }),
      };
    });

    mockInsert.mockImplementation(() => ({
      values: () => ({
        returning: () =>
          Promise.resolve([{ id: "11111111-1111-4111-8111-111111111111" }]),
      }),
    }));
    mockInsertSeo.mockResolvedValue(0);
    mockUpdate.mockImplementation(() => ({
      set: () => ({
        where: () => Promise.resolve([]),
      }),
    }));
  });

  it("returns 401 when unauthenticated", async () => {
    asMock.mockResolvedValue(null);
    const res = await POST(
      formRequest({ file: xlsxFile(["ASIN"], [["B00TEST123"]]) })
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for viewers", async () => {
    asMock.mockResolvedValue({
      user: { email: "v@example.com", role: "viewer" },
    });
    const res = await POST(
      formRequest({
        file: xlsxFile(
          ["ASIN", "SKU", "ClientIDCode", "Marketplace"],
          [["B00TEST123", "SKU-1", "AAC", "amazon.com"]]
        ),
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 when no file is uploaded", async () => {
    const res = await POST(formRequest());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "No file uploaded" });
  });

  it("rejects non-spreadsheet filenames", async () => {
    const res = await POST(
      formRequest({
        file: new File(["hello"], "notes.txt", { type: "text/plain" }),
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Only .xlsx, .xls, .xlsm, and .csv files are accepted",
    });
  });

  it("creates products from a valid spreadsheet", async () => {
    const res = await POST(
      formRequest({
        file: xlsxFile(
          ["ASIN", "SKU", "ClientIDCode", "Marketplace"],
          [["B00TEST123", "SKU-1", "AAC", "amazon.com"]]
        ),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.createdIds).toHaveLength(1);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("rejects a CLR upload with no ASINs in column A", async () => {
    const res = await POST(
      formRequest({
        file: clrFile([{ sku: "SKU-1", productType: "DRINK_FLAVORED" }]),
        clientIdCode: "AAC",
      })
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringMatching(/column A/i),
    });
  });

  it("creates CLR rows using ASINs from column A", async () => {
    const res = await POST(
      formRequest({
        file: clrFile([
          { sku: "SKU-1", productType: "DRINK_FLAVORED", asin: "B00TEST123" },
        ]),
        clientIdCode: "AAC",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.skipped).toBe(0);
    expect(mockInsert).toHaveBeenCalled();
  });

  it("skips CLR rows that have a SKU but no ASIN in column A", async () => {
    const res = await POST(
      formRequest({
        file: clrFile([
          { sku: "SKU-1", productType: "DRINK_FLAVORED", asin: "B00TEST123" },
          { sku: "SKU-2", productType: "DRINK_FLAVORED" },
        ]),
        clientIdCode: "AAC",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.errors).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/ASIN \(column A\)/i),
      }),
    ]);
  });

  it("skips existing CLR SKUs and saves SEO version 0 without updating Hub rows", async () => {
    mockSelect.mockImplementation(() => {
      const rows = [{ code: "AAC", generalLabel: "Color", bqLabel: "Color" }];
      const resolved = Promise.resolve(rows);
      return {
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "existing-1",
                asin: "B00TEST123",
                sku: "SKU-1",
                marketplace: "amazon.com",
                clientIdCode: "AAC",
              },
            ]),
          orderBy: () => resolved,
          then: resolved.then.bind(resolved),
          catch: resolved.catch.bind(resolved),
        }),
      };
    });
    mockInsertSeo.mockResolvedValue(1);

    const res = await POST(
      formRequest({
        file: clrFile([
          {
            sku: "SKU-1",
            productType: "GROCERY",
            asin: "B00TEST123",
            itemName: "Hydrate Lemon 12ct",
            description: "Daily hydration mix.",
            bullets: ["B1", "B2", "B3", "B4", "B5"],
            keywords: ["k1", "k2", "k3", "k4", "k5"],
          },
        ]),
        clientIdCode: "AAC",
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.overwritten).toBe(0);
    expect(body.seoVersion0).toBe(1);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsertSeo).toHaveBeenCalledWith([
      expect.objectContaining({
        ASIN: "B00TEST123",
        SKU: "SKU-1",
        ItemName: "Hydrate Lemon 12ct",
        ProductDescription: "Daily hydration mix.",
        DetailedBulletPoint1: "B1",
        DetailedBulletPoint5: "B5",
        GenericKeyword1: "k1",
        GenericKeyword5: "k5",
      }),
    ]);
  });

  it("creates a new CLR product with inherited SEO version 0 copy", async () => {
    let inserted: Record<string, unknown> | undefined;
    mockInsert.mockImplementation(() => ({
      values: (value: Record<string, unknown>) => {
        inserted = value;
        return {
          returning: () =>
            Promise.resolve([{ id: "11111111-1111-4111-8111-111111111111" }]),
        };
      },
    }));
    mockInsertSeo.mockResolvedValue(1);

    const res = await POST(
      formRequest({
        file: clrFile([
          {
            sku: "SKU-NEW",
            productType: "GROCERY",
            asin: "B00TEST999",
            itemName: "New Listing Title",
            description: "Inherited description.",
            bullets: ["One"],
            keywords: ["alpha"],
          },
        ]),
        clientIdCode: "AAC",
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      created: 1,
      skipped: 0,
      seoVersion0: 1,
    });
    expect(inserted?.itemName).toBe("New Listing Title");
    expect(inserted?.contentSeo).toMatchObject({
      ProductDescription: "Inherited description.",
      DetailedBulletPoint1: "One",
      GenericKeyword1: "alpha",
      SEOVersionNumber: "0",
    });
  });

  it("overwrites an existing CLR product when the SKU is selected", async () => {
    let updated: Record<string, unknown> | undefined;
    mockSelect.mockImplementation(() => {
      const rows = [{ code: "AAC", generalLabel: "Color", bqLabel: "Color" }];
      const resolved = Promise.resolve(rows);
      return {
        from: () => ({
          where: () =>
            Promise.resolve([
              {
                id: "existing-1",
                asin: "B00TEST123",
                sku: "SKU-1",
                marketplace: "amazon.com",
                clientIdCode: "AAC",
              },
            ]),
          orderBy: () => resolved,
          then: resolved.then.bind(resolved),
          catch: resolved.catch.bind(resolved),
        }),
      };
    });
    mockUpdate.mockImplementation(() => ({
      set: (value: Record<string, unknown>) => {
        updated = value;
        return { where: () => Promise.resolve([]) };
      },
    }));
    mockInsertSeo.mockResolvedValue(1);

    const res = await POST(
      formRequest({
        file: clrFile([
          {
            sku: "SKU-1",
            productType: "GROCERY",
            asin: "B00TEST123",
            itemName: "Hydrate Lemon 12ct",
            description: "Daily hydration mix.",
            bullets: ["B1"],
            keywords: ["k1"],
          },
        ]),
        clientIdCode: "AAC",
        overwriteSkus: ["SKU-1"],
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.overwritten).toBe(1);
    expect(body.skipped).toBe(0);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(updated?.itemName).toBe("Hydrate Lemon 12ct");
    expect(updated?.contentSeo).toMatchObject({
      ProductDescription: "Daily hydration mix.",
      DetailedBulletPoint1: "B1",
      GenericKeyword1: "k1",
      SEOVersionNumber: "0",
    });
    expect(updated?.variationGroup).toBeUndefined();
  });
});
