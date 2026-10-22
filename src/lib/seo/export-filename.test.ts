import { describe, it, expect } from "vitest";
import { seoExportFilename } from "./export-filename";

describe("seoExportFilename", () => {
  it("prefixes the project name", () => {
    expect(seoExportFilename("REA_SC_US_B0CLMBGMS6_SEO_V01", "Keywords")).toBe("REA_SC_US_B0CLMBGMS6_SEO_V01_Keywords.csv");
  });
  it("drops the prefix when there's no real name", () => {
    expect(seoExportFilename("", "COSMO_Map")).toBe("COSMO_Map.csv");
    expect(seoExportFilename("Untitled Project", "Reviews")).toBe("Reviews.csv");
  });
  it("strips characters a file name can't hold", () => {
    expect(seoExportFilename('A/B:"C"', "SEO_Content")).toBe("A-B--C-_SEO_Content.csv");
  });
});
