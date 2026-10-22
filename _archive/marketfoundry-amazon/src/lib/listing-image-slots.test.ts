import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IMAGE_SLOTS,
  isListingImageSlot,
  MAX_LISTING_IMAGE_BYTES,
  LISTING_IMAGE_THUMB_PX,
  LISTING_IMAGE_PREVIEW_PX,
  listingImageThumbPx,
  bytesToMb,
} from "./listing-image-slots";

describe("IMAGE_SLOTS", () => {
  it("is MAIN followed by PT01 through PT09", () => {
    expect(IMAGE_SLOTS).toEqual([
      "MAIN",
      "PT01",
      "PT02",
      "PT03",
      "PT04",
      "PT05",
      "PT06",
      "PT07",
      "PT08",
      "PT09",
    ]);
  });

  it("accepts PT09 and rejects unknown slots", () => {
    expect(isListingImageSlot("PT09")).toBe(true);
    expect(isListingImageSlot("MAIN")).toBe(true);
    expect(isListingImageSlot("PT10")).toBe(false);
    expect(isListingImageSlot("_all")).toBe(false);
  });
});

describe("MAX_LISTING_IMAGE_BYTES", () => {
  it("stays at or below Vercel's ~4.5 MB edge cap on request bodies", () => {
    // Above this the request is rejected before the route runs, so our own
    // 413 (with a readable JSON message) would never be reached.
    expect(MAX_LISTING_IMAGE_BYTES).toBeLessThanOrEqual(4_500_000);
  });

  it("does not regress the largest slot image production has accepted", () => {
    // B0GF1QGP4C.PT05.V01.png, uploaded 2026-08-17, 4.21 MiB.
    const PT05_BYTES = 4_415_750;
    expect(PT05_BYTES).toBeLessThanOrEqual(MAX_LISTING_IMAGE_BYTES);
  });

  it("admits every other slot size measured on that ASIN", () => {
    // MAIN 3.81, PT02 3.18, PT03 3.18, PT04 3.96 MiB.
    for (const mib of [3.81, 3.18, 3.96]) {
      expect(mib * 1024 * 1024).toBeLessThan(MAX_LISTING_IMAGE_BYTES);
    }
  });

  it("rejects a file comfortably over the cap", () => {
    expect(6 * 1024 * 1024).toBeGreaterThan(MAX_LISTING_IMAGE_BYTES);
  });
});

describe("listingImageThumbPx", () => {
  it("uses s400 for grid tiles and s1600 for the lightbox", () => {
    expect(listingImageThumbPx(true)).toBe(LISTING_IMAGE_THUMB_PX);
    expect(listingImageThumbPx(false)).toBe(LISTING_IMAGE_PREVIEW_PX);
    expect(LISTING_IMAGE_THUMB_PX).toBe(400);
    expect(LISTING_IMAGE_PREVIEW_PX).toBe(1600);
  });
});

describe("listing-image upload never posts bytes through Vercel", () => {
  it("the Listing Images UI PUTs to Drive instead of POSTing FormData", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/design/listing-images/[clientIdCode]/page.client.tsx"),
      "utf8"
    );
    expect(src).toMatch(/uploadViaDrive/);
    expect(src).not.toMatch(/fetch\("\/api\/design\/listing-images\/upload"/);
  });

  it("the image proxy serves a Drive thumbnail, never the original file", () => {
    const hub = readFileSync(
      join(process.cwd(), "src/app/api/design/listing-images/image/route.ts"),
      "utf8"
    );
    const portal = readFileSync(
      join(process.cwd(), "src/app/api/portal/design/listing-images/image/route.ts"),
      "utf8"
    );
    expect(hub).toMatch(/getThumbnail/);
    expect(hub).not.toMatch(/downloadFileContent/);
    expect(portal).toMatch(/getThumbnail/);
    expect(portal).not.toMatch(/downloadFileContent/);
  });
});

describe("bytesToMb", () => {
  it("formats decimal MB to one place, matching Finder and Vercel's quoted limit", () => {
    expect(bytesToMb(MAX_LISTING_IMAGE_BYTES)).toBe("4.5");
    expect(bytesToMb(6_500_000)).toBe("6.5");
    expect(bytesToMb(0)).toBe("0.0");
  });

  it("reports the measured PT05 upload the way Finder would", () => {
    expect(bytesToMb(4_415_750)).toBe("4.4");
  });
});
