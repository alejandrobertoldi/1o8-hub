import { describe, it, expect } from "vitest";
import { listingImagesByProduct } from "./revision-products";

describe("listingImagesByProduct", () => {
  it("maps Listing Images slots onto the PDP image fields, per product", () => {
    const out = listingImagesByProduct([
      { productId: "P1", slot: "MAIN", driveFileId: "d0" },
      { productId: "P1", slot: "PT01", driveFileId: "d1" },
      { productId: "P1", slot: "PT08", driveFileId: "d8" },
      { productId: "P2", slot: "MAIN", driveFileId: "x0" },
    ]);
    expect(out.P1).toEqual({
      MainImageURL: "/api/design/listing-images/image?driveFileId=d0",
      OtherImageURL1: "/api/design/listing-images/image?driveFileId=d1",
      OtherImageURL8: "/api/design/listing-images/image?driveFileId=d8",
    });
    expect(out.P2.MainImageURL).toContain("x0");
  });
  it("ignores unknown slots and rows without a Drive file", () => {
    expect(listingImagesByProduct([{ productId: "P1", slot: "SWATCH", driveFileId: "s" }, { productId: "P1", slot: "MAIN", driveFileId: null }])).toEqual({});
  });
});

import { pickThumbnail } from "./revision-products";
describe("pickThumbnail", () => {
  it("Hub listing image wins; Amazon main image is the fallback; none → null", () => {
    expect(pickThumbnail("/hub.jpg", "https://amz/main.jpg")).toBe("/hub.jpg");
    expect(pickThumbnail(null, "https://amz/main.jpg")).toBe("https://amz/main.jpg");
    expect(pickThumbnail("", "  ")).toBeNull();
  });
});
