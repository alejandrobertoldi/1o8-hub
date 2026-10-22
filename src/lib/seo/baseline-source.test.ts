import { describe, it, expect } from "vitest";
import { baselineVersionLabel, generatedToBaseline, hasGeneratedCopy, mergeListingVersions, projectVersionNumber, seoRowToBaseline, versionsForListing } from "./baseline-source";

describe("seoRowToBaseline", () => {
  it("copies the listing columns and blanks empty strings", () => {
    const f = seoRowToBaseline({ ItemName: "T", DetailedBulletPoint1: "b1", DetailedBulletPoint2: "  ", GenericKeyword1: "kw" });
    expect(f.ItemName).toBe("T");
    expect(f.DetailedBulletPoint1).toBe("b1");
    expect(f.DetailedBulletPoint2).toBeNull();
    expect(f.GenericKeyword1).toBe("kw");
    expect(f.ProductDescription).toBeNull();
  });
});

describe("baselineVersionLabel", () => {
  it("marks V00 as the inherited CLR copy", () => {
    expect(baselineVersionLabel({ version: "0", category: "Inherited", status: "Onboarding" })).toBe("V00 · Inherited (CLR)");
  });
  it("labels our versions with category and status", () => {
    expect(baselineVersionLabel({ version: "2", category: "Optimization", status: "Live" })).toBe("V02 · Optimization · Live");
    expect(baselineVersionLabel({ version: "1", category: "", status: "" })).toBe("V01");
  });
});

describe("versionsForListing", () => {
  const rows = [
    { ASIN: "B01", SKU: "S1", SEOVersionNumber: "2", SEOCategory: "Opt", SEOStatus: "Live", ItemName: "v2" },
    { ASIN: "B01", SKU: "S1", SEOVersionNumber: "0", SEOCategory: "Inherited", SEOStatus: "Onboarding", ItemName: "v0" },
    { ASIN: "B01", SKU: "OTHER", SEOVersionNumber: "1", SEOCategory: "Opt", SEOStatus: "Draft", ItemName: "other sku" },
    { ASIN: "B02", SKU: "S2", SEOVersionNumber: "1", ItemName: "b02" },
  ];
  it("matches ASIN+SKU and sorts oldest first", () => {
    expect(versionsForListing(rows, "B01", "S1").map((v) => v.version)).toEqual(["0", "2"]);
  });
  it("falls back to ASIN-only when no row has the SKU", () => {
    expect(versionsForListing(rows, "b02", "NOPE").map((v) => v.fields.ItemName)).toEqual(["b02"]);
  });
  it("returns nothing for an ASIN without versions (e.g. a new NTA listing)", () => {
    expect(versionsForListing(rows, "B09", "X")).toEqual([]);
  });
});

describe("projectVersionNumber", () => {
  it("reads the name suffix, either case", () => {
    expect(projectVersionNumber("REA_SC_US_01_ReadyRESCUE_v01", 1)).toBe("1");
    expect(projectVersionNumber("REA_SC_US_01_SEO_V03", 1)).toBe("3");
  });
  it("falls back to the version column", () => {
    expect(projectVersionNumber("Old project", 2)).toBe("2");
  });
});

describe("mergeListingVersions", () => {
  const fields = seoRowToBaseline({ ItemName: "x" });
  it("adds Hub project versions next to BigQuery ones, oldest first", () => {
    const merged = mergeListingVersions(
      [{ version: "0", category: "Regular", status: "", fields }],
      [{ projectName: "REA_SC_US_01_ReadyRESCUE_v01", version: "1", approved: true, fields: generatedToBaseline({ Title: "June copy" }) }]
    );
    expect(merged.map((v) => v.version)).toEqual(["0", "1"]);
    expect(merged[1].fields.ItemName).toBe("June copy");
    expect(baselineVersionLabel(merged[1])).toBe("V01 · REA_SC_US_01_ReadyRESCUE_v01 · Approved");
  });
  it("keeps the BigQuery copy when the number was published, labelled with the project", () => {
    const merged = mergeListingVersions(
      [{ version: "1", category: "Optimization", status: "Live", fields }],
      [{ projectName: "P_v01", version: "1", approved: true, fields: generatedToBaseline({ Title: "draft" }) }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].fields.ItemName).toBe("x");
    expect(merged[0].projectName).toBe("P_v01");
  });
});

describe("generatedToBaseline", () => {
  it("maps PascalCase S6 keys", () => {
    const f = generatedToBaseline({ Title: "T", DetailedBulletPoint_2: "b2", ProductDescription: "d", BackendSearchTerms: "k" });
    expect([f.ItemName, f.DetailedBulletPoint2, f.ProductDescription, f.GenericKeyword1]).toEqual(["T", "b2", "d", "k"]);
    expect(hasGeneratedCopy({ Title: "" })).toBe(false);
  });
});
