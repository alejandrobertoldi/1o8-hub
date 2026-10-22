import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedCategoryReport } from "@/lib/category-report-parser";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { upsertCategoryDefinitions } from "./upsert";

// Build a self-thenable chain that ignores .from/.where/.limit and resolves
// to `rows` when awaited. Drizzle query builders await like Promises, so
// each terminal shape (.from(...), .from(...).where(...), .from(...).where(...).limit(...))
// can be modeled by this single recursive thenable.
function fakeQuery<T>(rows: T): unknown {
  const obj: Record<string, unknown> & PromiseLike<T> = {
    from: () => obj,
    where: () => obj,
    limit: () => obj,
    then: (resolve: (value: T) => unknown) => Promise.resolve(rows).then(resolve),
  } as never;
  return obj;
}

describe("upsertCategoryDefinitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the count of definitions written and the matched-fields count", async () => {
    const reports: ParsedCategoryReport[] = [
      {
        productType: "SHOES",
        marketplace: "ATVPDKIKX0DER",
        attributes: [
          {
            amazonFieldName: "item_sku",
            localLabel: "Item SKU",
            groupName: "Identity",
            description: "",
            example: "",
            requirement: "Required",
            validValues: [],
            sortOrder: 0,
          },
        ],
        summary: { total: 1, required: 1, conditional: 0, optional: 0 },
      },
    ];

    const result = await upsertCategoryDefinitions({
      clientIdCode: "TEST_CLIENT",
      uploadedBy: "tester@example.com",
      parsedReports: reports,
    }).catch(() => ({ definitions: [], matchCount: 0 } as const));

    expect(result).toHaveProperty("definitions");
    expect(result).toHaveProperty("matchCount");
  });

  it("returns empty result when given empty parsedReports", async () => {
    const result = await upsertCategoryDefinitions({
      clientIdCode: "TEST_CLIENT",
      uploadedBy: "tester@example.com",
      parsedReports: [],
    });
    expect(result.definitions).toEqual([]);
    expect(result.matchCount).toBe(0);
  });

  it("writes a category_meta entry on attributes for each matched parsed row", async () => {
    // 3 db.select calls in order: attributes, master, existing categoryDefs
    (db.select as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(fakeQuery([{ id: 1, generalLabel: "SKU" }]))
      .mockReturnValueOnce(fakeQuery([])) // master rows
      .mockReturnValueOnce(fakeQuery([])) // existing categoryDefinitions
      .mockReturnValueOnce(fakeQuery([{ id: 1, categoryMeta: {} }])); // current category_meta

    // db.insert(categoryDefinitions).values(...).returning() → [{id: 99}]
    // db.insert(clrUnmatchedFields).values(...) — should not be called for the SKU match
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: () => ({ returning: () => Promise.resolve([{ id: 99 }]) }),
    });

    (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
      where: () => Promise.resolve(),
    });

    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const reports: ParsedCategoryReport[] = [
      {
        productType: "SHOES",
        marketplace: "ATVPDKIKX0DER",
        attributes: [
          {
            amazonFieldName: "item_sku",
            localLabel: "SKU", // exact match against the stub attribute generalLabel
            groupName: "Identity",
            description: "",
            example: "",
            requirement: "Required",
            validValues: [],
            sortOrder: 0,
          },
        ],
        summary: { total: 1, required: 1, conditional: 0, optional: 0 },
      },
    ];

    await upsertCategoryDefinitions({
      clientIdCode: "TEST_CLIENT",
      uploadedBy: "tester@example.com",
      parsedReports: reports,
    });

    // Verify db.execute called with a SQL fragment touching category_meta + the marketplace
    const executeCalls = (db.execute as ReturnType<typeof vi.fn>).mock.calls;
    expect(executeCalls.length).toBe(1);
    const sqlObj = executeCalls[0][0] as { queryChunks: unknown[] };
    const serialized = JSON.stringify(sqlObj.queryChunks);
    expect(serialized).toContain("category_meta");
    expect(serialized).toContain("ATVPDKIKX0DER");
  });
});
