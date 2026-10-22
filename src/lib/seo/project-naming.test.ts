import { describe, it, expect } from "vitest";
import {
  buildSeoProjectBaseName,
  variationSuffix,
  isFolderConventionName,
  seoExportTarget,
  GROUP_PLACEHOLDER,
} from "./project-naming";

describe("variationSuffix", () => {
  it("drops the client-code prefix from a variation id", () => {
    expect(variationSuffix("REA_SC_US_01")).toBe("01");
    expect(variationSuffix("TRT_SC_US_02")).toBe("02");
  });
  it("drops a STALE client prefix too (DRC → REA rename left variation ids behind)", () => {
    expect(variationSuffix("DRC_SC_US_01")).toBe("01");
  });
  it("keeps ids that don't look client-prefixed", () => {
    expect(variationSuffix("FAMILY7")).toBe("FAMILY7");
  });
});

describe("buildSeoProjectBaseName", () => {
  const c = "REA_SC_US";
  it("ASIN scope, one ASIN", () => {
    expect(buildSeoProjectBaseName({ clientIdCode: c, scope: "ASIN", asins: ["B0CLMBGMS6"] })).toBe(
      "REA_SC_US_B0CLMBGMS6_SEO"
    );
  });
  it("ASIN scope, several ASINs", () => {
    expect(buildSeoProjectBaseName({ clientIdCode: c, scope: "ASIN", asins: ["A", "B", "C"] })).toBe(
      "REA_SC_US_3ASINs_SEO"
    );
  });
  it("VARIATION scope uses the client code once, never the variation id's prefix", () => {
    expect(
      buildSeoProjectBaseName({ clientIdCode: c, scope: "VARIATION", asins: ["P", "A"], variationId: "DRC_SC_US_01" })
    ).toBe("REA_SC_US_01_SEO");
  });
  it("VARIATION scope without a variation id falls back to the parent ASIN", () => {
    expect(
      buildSeoProjectBaseName({ clientIdCode: c, scope: "VARIATION", asins: ["B0PARENT", "B0KID"], parentAsin: "B0PARENT" })
    ).toBe("REA_SC_US_B0PARENT_SEO");
  });
  it("GROUP scope leaves a G## placeholder for the server and tokenises the label", () => {
    expect(
      buildSeoProjectBaseName({ clientIdCode: c, scope: "GROUP", asins: ["A", "B"], groupLabel: "Pack of 3 / 12" })
    ).toBe(`REA_SC_US_${GROUP_PLACEHOLDER}_Pack_of_3_12_SEO`);
  });
});

describe("isFolderConventionName", () => {
  it("recognises new-convention names only", () => {
    expect(isFolderConventionName("REA_SC_US_01_SEO_V01")).toBe(true);
    expect(isFolderConventionName("REA_SC_US_G02_Choc_SEO_V12")).toBe(true);
    expect(isFolderConventionName("DRC_SC_US_01_ReadyRESCUE_v01")).toBe(false);
    expect(isFolderConventionName("Old project")).toBe(false);
  });
});

describe("seoExportTarget", () => {
  it("new names get their own folder and a doc of the same name", () => {
    expect(seoExportTarget("REA_SC_US_01_SEO_V02")).toEqual({
      folderName: "REA_SC_US_01_SEO_V02",
      docName: "REA_SC_US_01_SEO_V02",
    });
  });
  it("legacy names keep the SEO-{name} doc in the brand folder (so re-export still replaces it)", () => {
    expect(seoExportTarget("DRC_SC_US_01_ReadyRESCUE_v01")).toEqual({
      folderName: null,
      docName: "SEO-DRC_SC_US_01_ReadyRESCUE_v01",
    });
  });
  it("strips characters Drive can't take", () => {
    expect(seoExportTarget('A/B:"C"').docName).toBe("SEO-A-B--C-");
  });
});
