import { describe, it, expect } from "vitest";
import { storefrontAssetFilename } from "./drive-naming";

describe("storefrontAssetFilename", () => {
  it("builds padded filename", () => {
    expect(storefrontAssetFilename({ clientIdCode: "ZNG_SC_US", slug: "homepage", position: 1, moduleType: "header", ext: "png" }))
      .toBe("ZNG_SC_US_storefront_homepage_M01_header.png");
  });
  it("appends _cover suffix for poster slot", () => {
    expect(storefrontAssetFilename({ clientIdCode: "ZNG_SC_US", slug: "homepage", position: 2, moduleType: "video", ext: "jpg", slot: "poster" }))
      .toBe("ZNG_SC_US_storefront_homepage_M02_video_cover.jpg");
  });
  it("main slot (explicit) produces no suffix", () => {
    expect(storefrontAssetFilename({ clientIdCode: "ZNG_SC_US", slug: "homepage", position: 2, moduleType: "video", ext: "mp4", slot: "main" }))
      .toBe("ZNG_SC_US_storefront_homepage_M02_video.mp4");
  });
  it("inserts _T{NN} for a tile position", () => {
    expect(storefrontAssetFilename({ clientIdCode: "ZNG_SC_US", slug: "homepage", position: 1, moduleType: "split_section", ext: "jpg", tilePosition: 2 }))
      .toBe("ZNG_SC_US_storefront_homepage_M01_T02_split_section.jpg");
  });
  it("omits the tile segment when tilePosition is absent", () => {
    expect(storefrontAssetFilename({ clientIdCode: "ZNG_SC_US", slug: "homepage", position: 3, moduleType: "image", ext: "png" }))
      .toBe("ZNG_SC_US_storefront_homepage_M03_image.png");
  });
});
