// @vitest-environment node
//
// Regression test for the bulk-edit core-field misroute.
//
// The dialog used to send `field: attributes.general_label` (PascalCase, e.g.
// "ParentageLevel") where the route's `field in product` check needed the camelCase
// drizzle key ("parentageLevel"), AND `bqName: attributes.bq_label` (the raw Amazon
// flat-file name) where the JSONB blobs are keyed by the PascalCase name. Both
// lookups missed, so every edit fell through to
// `updates.otherAttributes[flatFileName] = value` while the real core column or blob
// key kept its old value. The table showed no change and a publish could push a
// conflicting value to BigQuery.
//
// The invariant these tests lock: the route resolves the target column from `bqName`
// alone, and a core-field edit NEVER creates an otherAttributes key.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));

vi.mock("@/lib/impact-snapshots", () => ({
  createImpactSnapshot: vi.fn(async () => undefined),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: vi.fn((task: unknown) => { void task; }) };
});

const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
/** Every payload handed to `.set()`, in call order. */
const setPayloads: Record<string, unknown>[] = [];
/** Every row array handed to `.values()`, in call order. */
const insertedRows: unknown[][] = [];

vi.mock("@/lib/db", () => {
  const tx = {
    select: (...args: unknown[]) => mockSelect(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  };
  return {
    db: {
      ...tx,
      transaction: (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    },
  };
});

import { PUT } from "./route";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

/** A master row shaped like the real select(): core columns + JSONB blobs. */
function masterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    asin: "B00TEST123",
    sku: "SKU-1",
    clientIdCode: "TEST",
    itemName: "Test item",
    parentageLevel: "Parent",
    mainImageUrl: "https://example.com/old.jpg",
    status: "Active",
    contentSeo: null,
    variations: { Size: "M", Color: "Red" },
    packaging: null,
    targetAudience: null,
    fulfillment: null,
    productAttributes: null,
    nutritionSupplements: null,
    complianceSafety: null,
    images: null,
    dimensionsWeight: null,
    otherAttributes: { SomethingElse: "keep me" },
    rawColumnValues: { ParentageLevel: "Parent" },
    changeLog: [],
    isDirty: false,
    ...overrides,
  };
}

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/products/bulk", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setupDb(row: Record<string, unknown>) {
  mockSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([row]),
    }),
  }));
  mockUpdate.mockImplementation(() => ({
    set: (payload: Record<string, unknown>) => {
      setPayloads.push(payload);
      return { where: vi.fn().mockResolvedValue(undefined) };
    },
  }));
  mockInsert.mockImplementation(() => ({
    values: (rows: unknown[]) => {
      insertedRows.push(rows);
      return Promise.resolve(undefined);
    },
  }));
}

describe("PUT /api/products/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPayloads.length = 0;
    insertedRows.length = 0;
  });

  it("writes a core field to its core column and creates NO otherAttributes shadow", async () => {
    setupDb(masterRow());

    const res = await PUT(
      req({
        productIds: [PRODUCT_ID],
        bqName: "ParentageLevel",
        value: "Child",
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ updated: 1, failed: 0 });

    expect(setPayloads).toHaveLength(1);
    const payload = setPayloads[0];
    // The core column is written...
    expect(payload.parentageLevel).toBe("Child");
    // ...and the JSONB blobs are left completely alone. This is the assertion the
    // old code failed: it wrote otherAttributes and never touched parentageLevel.
    expect(payload).not.toHaveProperty("otherAttributes");
    expect(payload).not.toHaveProperty("variations");
    expect(payload.isDirty).toBe(true);
  });

  it("records the camelCase coreField as the activity_log field_label for a core edit", async () => {
    setupDb(masterRow());

    await PUT(
      req({ productIds: [PRODUCT_ID], bqName: "ParentageLevel", value: "Child" })
    );

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0][0]).toMatchObject({
      fieldLabel: "parentageLevel",
      bqName: "ParentageLevel",
      oldValue: "Parent",
      newValue: "Child",
      editType: "bulk",
    });
  });

  it("ignores a wrong `field` sent by the client and still writes the core column", async () => {
    setupDb(masterRow());

    // Exactly what the old dialog sent: PascalCase general_label as `field`.
    await PUT(
      req({
        productIds: [PRODUCT_ID],
        field: "ParentageLevel",
        bqName: "ParentageLevel",
        value: "Child",
      })
    );

    expect(setPayloads[0].parentageLevel).toBe("Child");
    expect(setPayloads[0]).not.toHaveProperty("otherAttributes");
  });

  it("updates an existing JSONB blob key in place, not otherAttributes", async () => {
    setupDb(masterRow());

    await PUT(
      req({ productIds: [PRODUCT_ID], bqName: "Size", value: "L" })
    );

    expect(setPayloads[0].variations).toEqual({ Size: "L", Color: "Red" });
    expect(setPayloads[0]).not.toHaveProperty("otherAttributes");
    expect(insertedRows[0][0]).toMatchObject({
      fieldLabel: "Size",
      bqName: "Size",
      oldValue: "M",
    });
  });

  it("falls back to otherAttributes for a name in no blob and no core column", async () => {
    setupDb(masterRow());

    await PUT(
      req({ productIds: [PRODUCT_ID], bqName: "BrandNewField", value: "v" })
    );

    expect(setPayloads[0].otherAttributes).toEqual({
      SomethingElse: "keep me",
      BrandNewField: "v",
    });
  });

  it("still mirrors the value into rawColumnValues under bqName", async () => {
    setupDb(masterRow());

    await PUT(
      req({ productIds: [PRODUCT_ID], bqName: "ParentageLevel", value: "Child" })
    );

    expect(setPayloads[0].rawColumnValues).toEqual({ ParentageLevel: "Child" });
  });

  it("400s when bqName is missing", async () => {
    setupDb(masterRow());

    const res = await PUT(
      req({ productIds: [PRODUCT_ID], value: "x" })
    );

    expect(res.status).toBe(400);
  });
});
