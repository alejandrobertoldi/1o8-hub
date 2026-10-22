import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  inferStorefrontMime,
  storefrontExtFromMime,
  STOREFRONT_IMAGE_PREVIEW_PX,
} from "./asset-mime";

describe("inferStorefrontMime", () => {
  it("keeps a real MIME type", () => {
    expect(inferStorefrontMime({ type: "image/png", name: "x.bin" })).toBe("image/png");
  });

  it("fills an empty type from the filename", () => {
    expect(inferStorefrontMime({ type: "", name: "banner.PNG" })).toBe("image/png");
    expect(inferStorefrontMime({ type: "", name: "hero.jpg" })).toBe("image/jpeg");
  });

  it("returns empty when neither type nor a known extension is present", () => {
    expect(inferStorefrontMime({ type: "", name: "asset" })).toBe("");
  });
});

describe("storefrontExtFromMime", () => {
  it("maps jpeg to jpg", () => {
    expect(storefrontExtFromMime("image/jpeg")).toBe("jpg");
  });

  it("falls back to the filename extension", () => {
    expect(storefrontExtFromMime("application/octet-stream", "x.webp")).toBe("webp");
  });
});

describe("storefront uploads never post bytes through Vercel", () => {
  it("the canvas drop zone PUTs to Drive via /asset/session", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/storefront/storefront-module-preview.tsx"),
      "utf8"
    );
    expect(src).toMatch(/uploadStorefrontAsset/);
    expect(src).not.toMatch(/body:\s*fd/);
  });

  it("the sidebar uploader uses the same Drive path", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/storefront/storefront-asset-upload.tsx"),
      "utf8"
    );
    expect(src).toMatch(/\/session/);
    expect(src).toMatch(/sessionUri/);
  });

  it("the image proxy serves a Drive thumbnail, not the original", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/storefront/image/route.ts"),
      "utf8"
    );
    expect(src).toMatch(/getThumbnail/);
    expect(src).toMatch(/STOREFRONT_IMAGE_PREVIEW_PX/);
    expect(STOREFRONT_IMAGE_PREVIEW_PX).toBe(1600);
  });
});
