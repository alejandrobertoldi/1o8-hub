import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockedGetAuthSession, mockedGetSeoVersion, mockDb } = vi.hoisted(() => ({
  mockedGetAuthSession: vi.fn(),
  mockedGetSeoVersion: vi.fn(),
  mockDb: { select: vi.fn(), update: vi.fn(), insert: vi.fn() },
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/bigquery", () => ({ getSeoVersion: mockedGetSeoVersion }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/column-registry", () => ({
  CORE_COLUMNS: [{ bqName: "ItemName", coreField: "itemName" }],
}));

import { POST } from "./route";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const session = { user: { email: "a@b.com", role: "editor" } };

const PRODUCT = {
  id: PRODUCT_ID,
  asin: "B00TEST123",
  sku: "SKU-1",
  clientIdCode: "HAL",
  itemName: "Current v1 title",
  contentSeo: { SEOVersionNumber: "1", ItemName: "Current v1 title" },
  rawColumnValues: { SEOVersionNumber: "1" },
  changeLog: [],
};

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/seo/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const baseBody = {
  productId: PRODUCT_ID,
  seoCategory: "Inherited",
  asin: "B00TEST123",
  sku: "SKU-1",
};

function mockSelects(productRows: unknown[], asinRows: unknown[] = []) {
  const queue = [productRows, asinRows];
  mockDb.select.mockImplementation(() => {
    const next = queue.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(next),
    };
  });
}

describe("POST /api/seo/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAuthSession.mockResolvedValue(session);
    mockedGetSeoVersion.mockRejectedValue(new Error("BQ table missing"));
    mockSelects([PRODUCT], []);
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    });
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    });
  });

  it("does not treat version 0 as a missing version number", async () => {
    const res = await post({ ...baseBody, seoVersionNumber: "0" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it("accepts numeric 0 from JSON as version 0", async () => {
    const res = await post({ ...baseBody, seoVersionNumber: 0 });
    expect(res.status).toBe(200);
  });

  it("returns 400 when version number is actually missing", async () => {
    const res = await post({ ...baseBody, seoVersionNumber: "" });
    expect(res.status).toBe(400);
    expect(mockedGetSeoVersion).not.toHaveBeenCalled();
  });

  it("restores CLR listing copy from Hub existing content when BQ is down", async () => {
    mockSelects([PRODUCT], [
      {
        existingContent: {
          item_name: "CLR inherited title",
          product_description: "CLR description",
          detailed_bullets: ["CLR bullet"],
          generic_keywords: [],
        },
        asin: "B00TEST123",
        sku: "SKU-1",
      },
    ]);
    const setCalls: Record<string, unknown>[] = [];
    mockDb.update.mockReturnValue({
      set: vi.fn((payload: Record<string, unknown>) => {
        setCalls.push(payload);
        return { where: vi.fn().mockResolvedValue([]) };
      }),
    });

    const res = await post({ ...baseBody, seoVersionNumber: "0" });
    expect(res.status).toBe(200);
    expect(mockedGetSeoVersion).not.toHaveBeenCalled();
    expect(setCalls[0]?.itemName).toBe("CLR inherited title");
    expect(setCalls[0]?.rawColumnValues).toMatchObject({ SEOVersionNumber: "0" });
  });

  it("does not 500 when BigQuery has no SEO table and Hub has no snapshot", async () => {
    mockedGetSeoVersion.mockRejectedValue(
      new Error("Not found: Table mfhub-501815:1o8 Hub.SEO")
    );
    const res = await post({ ...baseBody, seoVersionNumber: "0" });
    expect(res.status).toBe(200);
  });
});
