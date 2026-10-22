// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  },
}));
vi.mock("@/lib/category-definitions/upsert", () => ({
  upsertCategoryDefinitions: vi
    .fn()
    .mockResolvedValue({ definitions: [], matchCount: 0 }),
}));
vi.mock("@/lib/onboarding/clr-aliases-loader", () => ({
  loadClrAliases: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/bigquery", () => ({
  insertInheritedSeoVersions: vi.fn().mockResolvedValue(0),
}));

import { POST } from "./route";
import { db } from "@/lib/db";

function buildSyntheticClr(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const PT = "product_type#1.value";
  const SKU = "contribution_sku#1.value";
  const ITEM_NAME =
    "item_name[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value";
  const BRAND =
    "brand[marketplace_id=ATVPDKIKX0DER][language_tag=en_US]#1.value";
  const apiFields = [PT, SKU, ITEM_NAME, BRAND];
  const tmplAoa: unknown[][] = [
    ["TEMPLATE"],
    [],
    apiFields.map(() => "Group"),
    apiFields.map((f) => f),
    apiFields,
    // Index 5: Amazon's embedded ABC123 example row — must be skipped.
    ["EXAMPLE_PT", "ABC123", "Example Item", "ExampleBrand"],
    // Index 6+: real data.
    ["SHOES", "SKU-1", "Red shoe", "Acme"],
    ["SHOES", "SKU-2", "Blue shoe", "Acme"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tmplAoa), "Template");
  const ddAoa: unknown[][] = [
    ["Data Definitions"],
    ["Group", "Field Name", "Local Label", "Description", "Example", "Requirement"],
    ["Identity", "", "", "", "", ""],
    ["", SKU, "Item SKU", "", "", "Required"],
    ["", ITEM_NAME, "Item Name", "", "", "Required"],
    ["", BRAND, "Brand Name", "", "", "Optional"],
    ["", PT, "Product Type", "", "", "Required"],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ddAoa), "Data Definitions");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function uploadRequest(phase: "preview" | "execute", file: ArrayBuffer): Request {
  const fd = new FormData();
  fd.set("file", new File([file], "clr.xlsm"));
  fd.set("clientIdCode", "TEST_CLIENT");
  return new Request(
    `http://localhost/api/onboarding/clr-import?phase=${phase}`,
    { method: "POST", body: fd }
  );
}

describe("POST /api/onboarding/clr-import", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preview returns parsed counts grouped by product type", async () => {
    // @ts-expect-error NextRequest vs Request shape close enough at the test layer
    const res = await POST(uploadRequest("preview", buildSyntheticClr()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRows).toBe(2);
    expect(body.productTypes).toEqual([
      { productType: "SHOES", count: 2, missingRequired: 0 },
    ]);
    expect(body.hasAlr).toBe(false);
    expect(body.hub).toEqual({
      matched: 0,
      unmatched: 2,
      existing: 0,
      missing: 0,
    });
    expect(body.listings).toEqual([]);
    expect(body.unmatchedSkus).toHaveLength(2);
    // Parsed payloads must NOT round-trip back to client (the whole point of
    // the FormData refactor — Vercel 4.5MB body limit).
    expect(body.parsedRows).toBeUndefined();
    expect(body.productSchemas).toBeUndefined();
  });

  it("execute writes to staged_clr_products from re-parsed file", async () => {
    // @ts-expect-error
    const res = await POST(uploadRequest("execute", buildSyntheticClr()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staged).toBe(2);
  });

  it("creates Hub products for CLR SKUs matched to ALR seller-sku ASINs", async () => {
    let sel = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: () => ({
        where: async () => {
          sel += 1;
          if (sel === 1) {
            return [
              { sku: "SKU-1", asin: "B00TEST123", status: "Active" },
              { sku: "SKU-2", asin: "B00TEST456", status: "Active" },
            ];
          }
          return [];
        },
      }),
    }));
    // @ts-expect-error NextRequest vs Request shape close enough at the test layer
    const res = await POST(uploadRequest("execute", buildSyntheticClr()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.staged).toBe(2);
    expect(body.created).toBe(2);
    expect(body.overwritten).toBe(0);
    expect(body.unmatched).toBe(0);
    expect(db.insert).toHaveBeenCalled();
  });

  it("skips Hub overwrite unless the SKU is selected", async () => {
    let sel = 0;
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      from: () => ({
        where: async () => {
          sel += 1;
          if (sel === 1) {
            return [{ sku: "SKU-1", asin: "B00TEST123", status: "Active" }];
          }
          return [{ id: "existing-1", sku: "SKU-1" }];
        },
      }),
    }));
    const fd = new FormData();
    fd.set("file", new File([buildSyntheticClr()], "clr.xlsm"));
    fd.set("clientIdCode", "TEST_CLIENT");
    fd.set("overwriteSkus", JSON.stringify([]));
    const res = await POST(
      // @ts-expect-error NextRequest vs Request
      new Request("http://localhost/api/onboarding/clr-import?phase=execute", {
        method: "POST",
        body: fd,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.overwritten).toBe(0);
    expect(body.skippedExisting).toBe(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    const auth = await import("@/lib/auth-db");
    (auth.getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    // @ts-expect-error
    const res = await POST(uploadRequest("preview", buildSyntheticClr()));
    expect(res.status).toBe(401);
  });

  it("returns 403 when role is viewer", async () => {
    const auth = await import("@/lib/auth-db");
    (auth.getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      user: { email: "x", role: "viewer" },
    });
    // @ts-expect-error
    const res = await POST(uploadRequest("preview", buildSyntheticClr()));
    expect(res.status).toBe(403);
  });
});
