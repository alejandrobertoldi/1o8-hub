import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedCategoryReport } from "@/lib/category-report-parser";

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { upsertAttributesMasterFromReports } from "./upload";

// Track every set(...) payload passed to db.update(...).set(...). Reset per test.
function captureUpdates(): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
    set: (v: Record<string, unknown>) => {
      calls.push(v);
      return { where: () => Promise.resolve([]) };
    },
  });
  return calls;
}

// Drizzle thenable chain helper (matches the pattern in
// src/lib/category-definitions/upsert.test.ts).
function fakeQuery<T>(rows: T): unknown {
  const obj: Record<string, unknown> & PromiseLike<T> = {
    from: () => obj,
    where: () => obj,
    limit: () => obj,
    orderBy: () => obj,
    then: (resolve: (value: T) => unknown) =>
      Promise.resolve(rows).then(resolve),
  } as never;
  return obj;
}

function fakeInsert<T>(returning: T): unknown {
  return {
    values: () => ({
      onConflictDoNothing: () => ({
        returning: () => Promise.resolve(returning),
      }),
      onConflictDoUpdate: () => ({
        returning: () => Promise.resolve(returning),
      }),
      returning: () => Promise.resolve(returning),
    }),
  };
}

function makeReport(
  productType: string,
  marketplace: string,
  attrs: Array<{
    hubLabel: string;
    requirement?: string;
    description?: string;
    validValues?: string[];
  }>
): ParsedCategoryReport {
  return {
    productType,
    marketplace,
    attributes: attrs.map((a, i) => ({
      amazonFieldName: a.hubLabel,
      localLabel: a.hubLabel,
      groupName: "G",
      description: a.description ?? "",
      example: "",
      requirement: a.requirement ?? "Required",
      validValues: a.validValues ?? [],
      sortOrder: i,
    })),
    summary: { total: attrs.length, required: 0, conditional: 0, optional: 0 },
  };
}

describe("upsertAttributesMasterFromReports", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts new canonical rows when no overlap with attributes_master", async () => {
    // No existing canonical rows
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(fakeQuery([]));
    const inserted: Array<{ uuid: string; attributesHubLabel: string }> = [
      { uuid: "uuid-1", attributesHubLabel: "color" },
    ];
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert(inserted));

    const result = await upsertAttributesMasterFromReports({
      uploadId: 100,
      clientIdCode: "ACME",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [{ hubLabel: "color" }]),
      ],
    });

    expect(result.canonicalInserted).toBe(1);
    expect(result.canonicalMatched).toBe(0);
    expect(result.provenanceWritten).toBe(1);
    expect(result.divergencesDetected).toBe(0);
  });

  it("writes provenance with NULL divergence when client values match canonical exactly", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-1",
          attributesHubLabel: "color",
          attributesRequirement: "Required",
          attributesDescription: "Color of the product",
          attributesValidValues: null,
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));

    const result = await upsertAttributesMasterFromReports({
      uploadId: 101,
      clientIdCode: "ACME",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          {
            hubLabel: "color",
            requirement: "Required",
            description: "Color of the product",
          },
        ]),
      ],
    });

    expect(result.canonicalInserted).toBe(0);
    expect(result.canonicalMatched).toBe(1);
    expect(result.provenanceWritten).toBe(1);
    expect(result.divergencesDetected).toBe(0);
  });

  it("populates client_* columns when client values diverge from canonical", async () => {
    // Canonical has explicit SAUCE entries — uploading SAUCE with different
    // values is a real per-client divergence (Phase 2 semantics).
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-1",
          attributesHubLabel: "color",
          attributesRequirement: JSON.stringify({ SAUCE: "Required" }),
          attributesDescription: JSON.stringify({ SAUCE: "Color of the product" }),
          attributesValidValues: JSON.stringify({ SAUCE: ["existing"] }),
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));
    const setCalls = captureUpdates();

    const result = await upsertAttributesMasterFromReports({
      uploadId: 102,
      clientIdCode: "ACME",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          {
            hubLabel: "color",
            requirement: "Conditionally Required", // diverges
            description: "Color of the product",
            validValues: ["red", "blue"], // diverges
          },
        ]),
      ],
    });

    expect(result.canonicalMatched).toBe(1);
    expect(result.divergencesDetected).toBe(1);
    expect(setCalls.length).toBe(0); // no canonical write — divergence, not first-wins
  });

  it("handles mixed: some new canonical inserts + some overlap with divergence", async () => {
    // First select: existing canonical = only "color" with explicit SAUCE key
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-color",
          attributesHubLabel: "color",
          attributesRequirement: JSON.stringify({ SAUCE: "Required" }),
          attributesDescription: JSON.stringify({ SAUCE: "C" }),
          attributesValidValues: null,
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeInsert([
        { uuid: "uuid-size", attributesHubLabel: "size" },
      ])
    );
    captureUpdates();

    const result = await upsertAttributesMasterFromReports({
      uploadId: 103,
      clientIdCode: "ACME",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          { hubLabel: "color", requirement: "Optional" }, // diverges (SAUCE explicit)
          { hubLabel: "size", requirement: "Required" }, // new
        ]),
      ],
    });

    expect(result.canonicalInserted).toBe(1);
    expect(result.canonicalMatched).toBe(1);
    expect(result.provenanceWritten).toBe(2);
    expect(result.divergencesDetected).toBe(1);
  });

  it("matches case-insensitively on Attributes_HubLabel", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-1",
          attributesHubLabel: "Color",
          attributesRequirement: "Required",
          attributesDescription: "",
          attributesValidValues: null,
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));

    const result = await upsertAttributesMasterFromReports({
      uploadId: 104,
      clientIdCode: "ACME",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          { hubLabel: "COLOR", requirement: "Required" },
        ]),
      ],
    });

    expect(result.canonicalInserted).toBe(0);
    expect(result.canonicalMatched).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Phase 2: per-productType first-wins write on the canonical-match branch.
  // See docs/superpowers/plans/2026-05-27-attributes-per-category-storage.md
  // ────────────────────────────────────────────────────────────────────────

  it("Phase 2: first SAUCE upload populates canonical[SAUCE] when no entry exists", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-1",
          attributesHubLabel: "color",
          attributesRequirement: null,
          attributesDescription: null,
          attributesValidValues: null,
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));
    const setCalls = captureUpdates();

    const result = await upsertAttributesMasterFromReports({
      uploadId: 200,
      clientIdCode: "CLOUD23",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          {
            hubLabel: "color",
            requirement: "Required",
            description: "Color of the product",
            validValues: ["red", "blue"],
          },
        ]),
      ],
    });

    expect(result.canonicalMatched).toBe(1);
    expect(result.divergencesDetected).toBe(0); // first-wins is not a divergence
    expect(setCalls.length).toBe(1);
    const written = setCalls[0];
    expect(JSON.parse(written.attributesRequirement as string)).toEqual({
      SAUCE: "Required",
    });
    expect(JSON.parse(written.attributesDescription as string)).toEqual({
      SAUCE: "Color of the product",
    });
    expect(JSON.parse(written.attributesValidValues as string)).toEqual({
      SAUCE: ["red", "blue"],
    });
  });

  it("Phase 2: second SAUCE upload with different value records divergence; canonical untouched", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-1",
          attributesHubLabel: "color",
          attributesRequirement: JSON.stringify({ SAUCE: "Required" }),
          attributesDescription: null,
          attributesValidValues: null,
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));
    const setCalls = captureUpdates();

    const result = await upsertAttributesMasterFromReports({
      uploadId: 201,
      clientIdCode: "CLOUD23",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          { hubLabel: "color", requirement: "Optional" },
        ]),
      ],
    });

    expect(result.canonicalMatched).toBe(1);
    expect(result.divergencesDetected).toBe(1);
    expect(setCalls.length).toBe(0);
  });

  it("Phase 2: BABY_PRODUCT upload appends key; SAUCE entry preserved", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-1",
          attributesHubLabel: "color",
          attributesRequirement: JSON.stringify({ SAUCE: "Required" }),
          attributesDescription: null,
          attributesValidValues: JSON.stringify({ SAUCE: ["red", "blue"] }),
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));
    const setCalls = captureUpdates();

    const result = await upsertAttributesMasterFromReports({
      uploadId: 202,
      clientIdCode: "CLOUD23",
      parsedReports: [
        makeReport("BABY_PRODUCT", "ATVPDKIKX0DER", [
          {
            hubLabel: "color",
            requirement: "Optional",
            validValues: ["small", "large"],
          },
        ]),
      ],
    });

    expect(result.canonicalMatched).toBe(1);
    expect(result.divergencesDetected).toBe(0);
    expect(setCalls.length).toBe(1);
    const written = setCalls[0];
    expect(JSON.parse(written.attributesRequirement as string)).toEqual({
      SAUCE: "Required",
      BABY_PRODUCT: "Optional",
    });
    expect(JSON.parse(written.attributesValidValues as string)).toEqual({
      SAUCE: ["red", "blue"],
      BABY_PRODUCT: ["small", "large"],
    });
  });

  it("Phase 2: legacy plain-text canonical promotes to {ALL, PT} on differing upload; stays flat on match", async () => {
    // 4A — differing upload promotes legacy plain text to {ALL, SAUCE}
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-A",
          attributesHubLabel: "color",
          attributesRequirement: "Required", // legacy plain text
          attributesDescription: null,
          attributesValidValues: null,
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));
    const setCallsA = captureUpdates();

    const resultA = await upsertAttributesMasterFromReports({
      uploadId: 203,
      clientIdCode: "CLOUD23",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          { hubLabel: "color", requirement: "Optional" },
        ]),
      ],
    });

    expect(resultA.divergencesDetected).toBe(0); // first-wins per (uuid, SAUCE)
    expect(setCallsA.length).toBe(1);
    expect(JSON.parse(setCallsA[0].attributesRequirement as string)).toEqual({
      ALL: "Required",
      SAUCE: "Optional",
    });

    // 4B — matching upload stays flat (no canonical write needed)
    vi.clearAllMocks();
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(
      fakeQuery([
        {
          uuid: "uuid-B",
          attributesHubLabel: "color",
          attributesRequirement: "Required",
          attributesDescription: null,
          attributesValidValues: null,
        },
      ])
    );
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(fakeInsert([]));
    const setCallsB = captureUpdates();

    const resultB = await upsertAttributesMasterFromReports({
      uploadId: 204,
      clientIdCode: "CLOUD23",
      parsedReports: [
        makeReport("SAUCE", "ATVPDKIKX0DER", [
          { hubLabel: "color", requirement: "Required" },
        ]),
      ],
    });

    expect(resultB.divergencesDetected).toBe(0);
    expect(setCallsB.length).toBe(0);
  });
});
