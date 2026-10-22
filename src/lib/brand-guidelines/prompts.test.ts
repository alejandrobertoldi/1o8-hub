import { describe, it, expect } from "vitest";
import {
  BRAND_BOOK_TO_MD_PROMPT,
  BRAND_BOOK_SUMMARY_PROMPT,
  BRAND_SUMMARY_TOOL_SCHEMA,
} from "./prompts";
import { summaryAllSchema } from "./types";

describe("brand-guidelines prompts", () => {
  it("MD prompt mentions preserving headings, lists, tables", () => {
    expect(BRAND_BOOK_TO_MD_PROMPT).toMatch(/heading/i);
    expect(BRAND_BOOK_TO_MD_PROMPT).toMatch(/list/i);
    expect(BRAND_BOOK_TO_MD_PROMPT).toMatch(/table/i);
  });

  it("summary prompt instructs single tool call and no invention", () => {
    expect(BRAND_BOOK_SUMMARY_PROMPT).toMatch(/save_summary/);
    expect(BRAND_BOOK_SUMMARY_PROMPT).toMatch(/not invent/i);
  });

  it("tool input_schema declares logo, colors, typography, voice required", () => {
    const schema = BRAND_SUMMARY_TOOL_SCHEMA;
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(
      expect.arrayContaining(["logo", "colors", "typography", "voice"])
    );
    // Spot-check shape — must match summaryAllSchema
    const sampleValid = {
      logo: {
        primary_description: "wordmark",
        secondary_description: null,
        monochrome_description: null,
        clearspace_notes: null,
        misuse_notes: null,
        primary_url: null,
        secondary_url: null,
        monochrome_url: null,
      },
      colors: [{ role: "primary", name: "ACME Red", hex: "#E10600", rgb: null, cmyk: null }],
      typography: { primary: null, secondary: null },
      voice: { attributes: [], dos: [], donts: [], sample_copy: null },
    };
    expect(summaryAllSchema.parse(sampleValid)).toEqual(sampleValid);
  });
});
