import { describe, it, expect } from "vitest";
import { printImageUrl, clampPrintWidth } from "./print-image-url";

const P = (gid: string) => `/api/case-studies/print-image?driveFileId=${gid}&w=1600`;

describe("printImageUrl", () => {
  it("rewrites all four Design proxy forms to the print-image route", () => {
    expect(printImageUrl("/api/design/listing-images/image?driveFileId=g1")).toBe(P("g1"));
    expect(printImageUrl("/api/storefront/image?driveFileId=g2")).toBe(P("g2"));
    expect(printImageUrl("/api/aplus2/image?driveFileId=g3")).toBe(P("g3"));
    expect(printImageUrl("/api/design-status/brand-story-image?driveFileId=g_4-x")).toBe(P("g_4-x"));
  });

  it("keeps the id when other params are present and honours a custom width", () => {
    expect(printImageUrl("/api/aplus2/image?thumb=1&driveFileId=g3", 800))
      .toBe("/api/case-studies/print-image?driveFileId=g3&w=800");
  });

  it("passes manual external URLs, bundled assets and unknown proxies through unchanged", () => {
    for (const u of [
      "https://example.com/a.jpg?driveFileId=g1",
      "https://drive.google.com/uc?id=abc",
      "/case-study/mf-mark.png",
      "/api/other/image?driveFileId=g1",
      "data:image/png;base64,AAAA",
    ]) expect(printImageUrl(u)).toBe(u);
  });

  it("passes through a proxy URL with a missing or unsafe id", () => {
    expect(printImageUrl("/api/aplus2/image")).toBe("/api/aplus2/image");
    expect(printImageUrl("/api/aplus2/image?driveFileId=a%2F..")).toBe("/api/aplus2/image?driveFileId=a%2F..");
  });
});

describe("clampPrintWidth", () => {
  it("defaults, clamps and rounds", () => {
    expect(clampPrintWidth(null)).toBe(1600);
    expect(clampPrintWidth("")).toBe(1600);
    expect(clampPrintWidth("x")).toBe(1600);
    expect(clampPrintWidth("10")).toBe(400);
    expect(clampPrintWidth("9999")).toBe(2000);
    expect(clampPrintWidth("1000")).toBe(1000);
  });
});
