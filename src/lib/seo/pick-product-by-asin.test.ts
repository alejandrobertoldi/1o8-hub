import { describe, it, expect } from "vitest";
import { pickProductByAsin } from "./pick-product-by-asin";

// B0CLMBGMS6 has two catalog rows; the SEO project is on the -FBA SKU
const empty = { id: "f7fb", asin: "B0CLMBGMS6", sku: "ReadyRESCUE3x30g" };
const fba = { id: "c77e", asin: "B0CLMBGMS6", sku: "ReadyRESCUE3x30g-FBA" };
const other = { id: "a6a5", asin: "B0DCLWMB4Y", sku: "RRSINGLE-FBA" };

describe("pickProductByAsin", () => {
  it("picks the row whose SKU matches the project's SKU, whatever the row order", () => {
    const skus = [{ asin: "B0CLMBGMS6", sku: "ReadyRESCUE3x30g-FBA" }];
    expect(pickProductByAsin([empty, fba], skus).get("B0CLMBGMS6")?.id).toBe("c77e");
    expect(pickProductByAsin([fba, empty], skus).get("B0CLMBGMS6")?.id).toBe("c77e");
  });

  it("SKU match ignores case and surrounding spaces", () => {
    expect(pickProductByAsin([empty, fba], [{ asin: "B0CLMBGMS6", sku: " readyrescue3x30g-fba " }]).get("B0CLMBGMS6")?.id).toBe("c77e");
  });

  it("falls back to a stable choice (lowest id) when no SKU matches", () => {
    expect(pickProductByAsin([fba, empty], [{ asin: "B0CLMBGMS6", sku: "NOPE" }]).get("B0CLMBGMS6")?.id).toBe("c77e");
    expect(pickProductByAsin([empty, fba], []).get("B0CLMBGMS6")?.id).toBe("c77e");
  });

  it("a single row per ASIN is used as-is", () => {
    expect(pickProductByAsin([other], []).get("B0DCLWMB4Y")?.id).toBe("a6a5");
  });
});

describe("pickProductByAsin null ASIN", () => {
  it("skips rows without an ASIN", () => {
    expect(pickProductByAsin([{ id: "z", asin: null, sku: "x" }], []).size).toBe(0);
  });
});
