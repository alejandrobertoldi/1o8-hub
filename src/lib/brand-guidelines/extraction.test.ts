import { describe, it, expect, vi, beforeEach } from "vitest";

const { pdfParseMock, anthropicCreateMock, txCalls, dbUpdateMock } = vi.hoisted(() => {
  return {
    pdfParseMock: vi.fn(),
    anthropicCreateMock: vi.fn(),
    txCalls: [] as Array<{ table: string; values: unknown }>,
    dbUpdateMock: vi.fn(),
  };
});

vi.mock("pdf-parse/lib/pdf-parse.js", () => ({ default: pdfParseMock }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreateMock };
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    transaction: async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        update: (tbl: { name?: string }) => ({
          set: (values: unknown) => ({
            where: () => {
              txCalls.push({ table: String(tbl.name ?? "?"), values });
              return Promise.resolve();
            },
          }),
        }),
      };
      return fn(tx);
    },
    update: () => ({
      set: (values: unknown) => ({
        where: () => {
          dbUpdateMock(values);
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  clientBrandGuidelines: { name: "client_brand_guidelines", clientIdCode: "client_id_code" },
  clientBrandGuidelineVersions: { name: "client_brand_guideline_versions", id: "id" },
}));

import { runExtraction } from "./extraction";

beforeEach(() => {
  pdfParseMock.mockReset();
  anthropicCreateMock.mockReset();
  dbUpdateMock.mockReset();
  txCalls.length = 0;
});

describe("runExtraction", () => {
  it("on success: writes extracted_md + page_count to version, summary fields + status=idle to guidelines", async () => {
    pdfParseMock.mockResolvedValue({ text: "raw pdf text", numpages: 24 });
    anthropicCreateMock
      .mockResolvedValueOnce({ content: [{ type: "text", text: "# Brand book\n..." }] })
      .mockResolvedValueOnce({
        content: [{
          type: "tool_use",
          name: "save_summary",
          input: {
            logo: {
              primary_description: "wordmark", secondary_description: null,
              monochrome_description: null, clearspace_notes: null, misuse_notes: null,
              primary_url: null, secondary_url: null, monochrome_url: null,
            },
            colors: [{ role: "primary", name: "Red", hex: "#E10600", rgb: null, cmyk: null }],
            typography: { primary: null, secondary: null },
            voice: { attributes: [], dos: [], donts: [], sample_copy: null },
          },
        }],
      });

    await runExtraction({
      versionId: "v-1",
      clientIdCode: "ACME",
      pdfBuffer: Buffer.from("%PDF-1.4 ..."),
    });

    expect(pdfParseMock).toHaveBeenCalledOnce();
    expect(anthropicCreateMock).toHaveBeenCalledTimes(2);
    expect(txCalls).toHaveLength(2);
    expect(txCalls[0].table).toBe("client_brand_guideline_versions");
    expect(txCalls[1].table).toBe("client_brand_guidelines");
    expect((txCalls[1].values as { extractionStatus: string }).extractionStatus).toBe("idle");
  });

  it("on Claude error: sets extraction_status='failed' with error message and rethrows", async () => {
    pdfParseMock.mockResolvedValue({ text: "raw", numpages: 5 });
    anthropicCreateMock.mockRejectedValueOnce(new Error("Claude went home"));

    await expect(
      runExtraction({ versionId: "v-1", clientIdCode: "ACME", pdfBuffer: Buffer.from("%PDF-1.4") })
    ).rejects.toThrow("Claude went home");

    expect(dbUpdateMock).toHaveBeenCalledOnce();
    const args = dbUpdateMock.mock.calls[0][0] as { extractionStatus: string; lastExtractionError: string };
    expect(args.extractionStatus).toBe("failed");
    expect(args.lastExtractionError).toContain("Claude went home");
  });
});
