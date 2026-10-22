import { describe, it, expect, vi, beforeEach } from "vitest";

let bgRows: unknown[] = [];
let versionRows: unknown[] = [];
let noteRows: unknown[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (tbl: { name: string }) => ({
        where: () => ({
          limit: () => Promise.resolve(
            tbl.name === "client_brand_guidelines" ? bgRows
              : tbl.name === "client_brand_guideline_versions" ? versionRows
              : []
          ),
          orderBy: () => Promise.resolve(noteRows),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/db/schema", () => ({
  clientBrandGuidelines: { name: "client_brand_guidelines", clientIdCode: "client_id_code", id: "id" },
  clientBrandGuidelineVersions: { name: "client_brand_guideline_versions", id: "id" },
  clientBrandGuidelineNotes: { name: "client_brand_guideline_notes", clientIdCode: "client_id_code", deletedAt: "deleted_at", createdAt: "created_at" },
}));

import { renderBrandGuidelinesMd } from "./render";

beforeEach(() => {
  bgRows = [];
  versionRows = [];
  noteRows = [];
});

describe("renderBrandGuidelinesMd", () => {
  it("returns empty string when no row or no active version", async () => {
    expect(await renderBrandGuidelinesMd("ACME")).toBe("");
    bgRows = [{ activeVersionId: null }];
    expect(await renderBrandGuidelinesMd("ACME")).toBe("");
  });

  it("renders summary, version metadata, and notes when present", async () => {
    bgRows = [{
      id: "bg-1",
      clientIdCode: "ACME",
      activeVersionId: "v-1",
      summaryLogo: {
        primary_description: "ACME wordmark in red",
        secondary_description: null, monochrome_description: null,
        clearspace_notes: "1x cap height around all sides",
        misuse_notes: "Don't recolor",
        primary_url: null, secondary_url: null, monochrome_url: null,
      },
      summaryColors: [
        { role: "primary", name: "ACME Red", hex: "#E10600", rgb: "225,6,0", cmyk: null },
      ],
      summaryTypography: {
        primary: { family: "Inter", weights: ["400", "700"], fallback: "system-ui" },
        secondary: null,
      },
      summaryVoice: {
        attributes: ["bold", "playful"],
        dos: ["use active voice"],
        donts: ["use jargon"],
        sample_copy: "Less talk. More flavor.",
      },
    }];
    versionRows = [{
      id: "v-1", versionNumber: 3, originalFilename: "acme-brandbook-2025.pdf",
      uploadedAt: new Date("2026-05-06T10:00:00Z"), uploadedBy: "manu@",
      extractedMd: "# Brand book\n\nFull text here.",
    }];
    noteRows = [
      { createdAt: new Date("2026-04-22T10:00:00Z"), authorEmail: "sara@", bodyMd: "Voice should skew younger" },
      { createdAt: new Date("2026-05-06T10:00:00Z"), authorEmail: "manu@", bodyMd: "After call: client wants brighter red" },
    ];

    const md = await renderBrandGuidelinesMd("ACME");
    expect(md).toContain("# Brand Guidelines — ACME");
    expect(md).toContain("v3");
    expect(md).toContain("acme-brandbook-2025.pdf");
    expect(md).toContain("ACME wordmark in red");
    expect(md).toContain("| primary | ACME Red | #E10600 | 225,6,0 |  |");
    expect(md).toContain("Inter");
    expect(md).toContain("bold, playful");
    expect(md).toContain("use active voice");
    expect(md).toContain("use jargon");
    expect(md).toContain("Less talk. More flavor.");
    expect(md).toContain("Full text here.");
    expect(md).toContain("2026-04-22 — sara@");
    expect(md).toContain("2026-05-06 — manu@");
  });
});
