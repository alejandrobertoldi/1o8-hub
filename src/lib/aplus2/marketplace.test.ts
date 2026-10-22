import { describe, expect, it } from "vitest";
import { normalizeMarketplace, isValidMarketplaceCode } from "./marketplace";

describe("normalizeMarketplace", () => {
  it("returns 2-letter country when populated", () => {
    expect(normalizeMarketplace({ country: "US", marketplace: "AmazonUS" })).toBe("US");
    expect(normalizeMarketplace({ country: "uk", marketplace: null })).toBe("UK");
  });
  it("falls back to last 2 letters of marketplace string", () => {
    expect(normalizeMarketplace({ country: null, marketplace: "AmazonDE" })).toBe("DE");
    expect(normalizeMarketplace({ country: null, marketplace: "Amazon.com.mx" })).toBe("MX");
    expect(normalizeMarketplace({ country: null, marketplace: "Amazon.com" })).toBe("US");
  });
  it("returns null when neither column is parseable", () => {
    expect(normalizeMarketplace({ country: null, marketplace: null })).toBeNull();
    expect(normalizeMarketplace({ country: "", marketplace: "" })).toBeNull();
    expect(normalizeMarketplace({ country: "USA", marketplace: "Amazon" })).toBeNull();
  });
});

describe("isValidMarketplaceCode", () => {
  it("accepts 2-letter uppercase ISO codes", () => {
    expect(isValidMarketplaceCode("US")).toBe(true);
    expect(isValidMarketplaceCode("DE")).toBe(true);
  });
  it("rejects non-2-letter or non-alpha", () => {
    expect(isValidMarketplaceCode("USA")).toBe(false);
    expect(isValidMarketplaceCode("u1")).toBe(false);
    expect(isValidMarketplaceCode("")).toBe(false);
    expect(isValidMarketplaceCode("us")).toBe(false);
  });
});
