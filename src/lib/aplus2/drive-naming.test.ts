import { describe, expect, it } from "vitest";
import {
  contentTokenFor,
  aplus2DisplayContentToken,
  aplus2VersionSlug,
  aplus2VersionSlugFromSet,
  aplus2VersionDisplayName,
  aplus2MasterSubfolderName,
  aplus2ModulePosition,
  aplus2RenameModuleSegment,
  aplus2TempReorderFilename,
  aplus2ItemToken,
  aplus2AssetFilename,
} from "./drive-naming";

describe("contentTokenFor", () => {
  it("maps PA+ to APlus", () => {
    expect(contentTokenFor("PA+")).toBe("APlus");
  });
  it("maps BA+ to ABasic", () => {
    expect(contentTokenFor("BA+")).toBe("ABasic");
  });
});

describe("aplus2DisplayContentToken", () => {
  it("matches Drive tokens", () => {
    expect(aplus2DisplayContentToken("PA+")).toBe("APlus");
    expect(aplus2DisplayContentToken("BA+")).toBe("ABasic");
  });
});

describe("aplus2VersionDisplayName", () => {
  it("uses ABasic for BA+ and includes marketplace", () => {
    expect(
      aplus2VersionDisplayName({
        clientIdCode: "BNU_SC_US",
        marketplace: "US",
        scopeIdentifier: "B0B39MGKRQ",
        contentType: "BA+",
        versionNumber: 1,
      })
    ).toBe("BNU_SC_US_US_B0B39MGKRQ_ABasic_V01");
  });
  it("uses APlus for PA+", () => {
    expect(
      aplus2VersionDisplayName({
        clientIdCode: "BNU_SC_US",
        marketplace: "US",
        scopeIdentifier: "B0B39MGKRQ",
        contentType: "PA+",
        versionNumber: 2,
      })
    ).toBe("BNU_SC_US_US_B0B39MGKRQ_APlus_V02");
  });
  it("uses Variation ID for PARENT/VARIATION scope", () => {
    expect(
      aplus2VersionDisplayName({
        clientIdCode: "TRT_SC_US",
        marketplace: "US",
        scopeIdentifier: "B0DSHV9N8H",
        scopeType: "PARENT",
        variationId: "TRT_SC_US_02",
        contentType: "PA+",
        versionNumber: 1,
      })
    ).toBe("TRT_SC_US_US_TRT_SC_US_02_APlus_V01");
  });
});

describe("aplus2VersionSlug", () => {
  it("formats clientIdCode + ASIN + APlus + version (no marketplace)", () => {
    expect(
      aplus2VersionSlug({
        clientIdCode: "DRC_SC_US",
        scopeIdentifier: "B0DCLWMB4Y",
        contentType: "PA+",
        versionNumber: 2,
      })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02");
  });
  it("formats variation-scope folders as clientIdCode_VariationID_APlus_V##", () => {
    expect(
      aplus2VersionSlugFromSet({
        clientIdCode: "TRT_SC_US",
        scopeType: "PARENT",
        scopeIdentifier: "B0DSHV9N8H",
        variationId: "TRT_SC_US_02",
        contentType: "PA+",
        versionNumber: 1,
      })
    ).toBe("TRT_SC_US_TRT_SC_US_02_APlus_V01");
  });
  it("formats GROUP folders with number and filter label", () => {
    expect(
      aplus2VersionSlugFromSet({
        clientIdCode: "DRE_SC_US",
        scopeType: "GROUP",
        scopeIdentifier: "G01_Nordic_Dreams",
        variationId: null,
        contentType: "PA+",
        versionNumber: 2,
      }),
    ).toBe("DRE_SC_US_G01_Nordic_Dreams_APlus_V02");
  });
  it("uses ABasic for BA+ content and pads the version", () => {
    expect(
      aplus2VersionSlug({
        clientIdCode: "C",
        scopeIdentifier: "B0X",
        contentType: "BA+",
        versionNumber: 12,
      })
    ).toBe("C_B0X_ABasic_V12");
  });
});

describe("aplus2MasterSubfolderName", () => {
  it("appends _Master_Files to the version slug", () => {
    expect(aplus2MasterSubfolderName("ELK_SC_US_B0H6YH11SF_APlus_V01")).toBe(
      "ELK_SC_US_B0H6YH11SF_APlus_V01_Master_Files"
    );
  });
});

describe("aplus2ModulePosition", () => {
  it("pads to M##", () => {
    expect(aplus2ModulePosition(1)).toBe("M01");
    expect(aplus2ModulePosition(7)).toBe("M07");
    expect(aplus2ModulePosition(10)).toBe("M10");
  });
});

describe("aplus2RenameModuleSegment", () => {
  it("updates only the M## token so swapped modules keep the rest of the name", () => {
    expect(
      aplus2RenameModuleSegment("BNU_SC_US_B0B39MGKRQ_ABasic_V01_M03_image_DV.png", 1)
    ).toBe("BNU_SC_US_B0B39MGKRQ_ABasic_V01_M01_image_DV.png");
  });
  it("leaves names without an M## segment unchanged", () => {
    expect(aplus2RenameModuleSegment("notes.txt", 2)).toBe("notes.txt");
  });
});

describe("aplus2TempReorderFilename", () => {
  it("inserts a unique temp token to avoid Drive name collisions during swaps", () => {
    expect(
      aplus2TempReorderFilename("BNU_SC_US_B0B39MGKRQ_APlus_V02_M01_image_DV.png", "ab12")
    ).toBe("BNU_SC_US_B0B39MGKRQ_APlus_V02_Mtmpab12_image_DV.png");
  });
});

describe("aplus2ItemToken", () => {
  it("returns 'video' for any video kind regardless of slot", () => {
    expect(aplus2ItemToken({ moduleType: "full_video", kind: "video", slotKey: "video" })).toBe("video");
    expect(aplus2ItemToken({ moduleType: "video_image_carousel", kind: "video", slotKey: "video" })).toBe("video");
  });

  it("returns Slide## for carousel repeatable item images", () => {
    expect(aplus2ItemToken({ moduleType: "simple_image_carousel", kind: "image", slotKey: "slide_image", itemPosition: 1 })).toBe("Slide01");
    expect(aplus2ItemToken({ moduleType: "regimen_carousel", kind: "image", slotKey: "step_image", itemPosition: 2 })).toBe("Slide02");
    expect(aplus2ItemToken({ moduleType: "navigation_carousel", kind: "image", slotKey: "tab_image", itemPosition: 3 })).toBe("Slide03");
    expect(aplus2ItemToken({ moduleType: "video_image_carousel", kind: "image", slotKey: "carousel_image", itemPosition: 1 })).toBe("Slide01");
  });

  it("returns hotspot## for hotspot repeatable item images", () => {
    expect(aplus2ItemToken({ moduleType: "hotspots_1", kind: "image", slotKey: "hotspot_image", itemPosition: 1 })).toBe("hotspot01");
    expect(aplus2ItemToken({ moduleType: "hotspots_2", kind: "image", slotKey: "hotspot_image", itemPosition: 2 })).toBe("hotspot02");
  });

  it("maps video_thumbnail to thumbnail", () => {
    expect(aplus2ItemToken({ moduleType: "full_video", kind: "image", slotKey: "video_thumbnail" })).toBe("thumbnail");
  });

  it("maps hero_product to hero", () => {
    expect(aplus2ItemToken({ moduleType: "comparison_table_1", kind: "image", slotKey: "hero_product" })).toBe("hero");
  });

  it("maps product_N to product0N", () => {
    expect(aplus2ItemToken({ moduleType: "comparison_table_1", kind: "image", slotKey: "product_1" })).toBe("product01");
    expect(aplus2ItemToken({ moduleType: "comparison_table_1", kind: "image", slotKey: "product_6" })).toBe("product06");
  });

  it("maps image_N to image0N", () => {
    expect(aplus2ItemToken({ moduleType: "four_images_text", kind: "image", slotKey: "image_1" })).toBe("image01");
    expect(aplus2ItemToken({ moduleType: "dual_images_text", kind: "image", slotKey: "image_2" })).toBe("image02");
  });

  it("maps single image slots to image", () => {
    expect(aplus2ItemToken({ moduleType: "full_image", kind: "image", slotKey: "main_image" })).toBe("image");
    expect(aplus2ItemToken({ moduleType: "background_image_text", kind: "image", slotKey: "background_image" })).toBe("image");
  });
});

describe("aplus2AssetFilename", () => {
  const slug = "DRC_SC_US_B0DCLWMB4Y_APlus_V02";

  it("emits _DV for a desktop single image", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 1, moduleType: "full_image", kind: "image", slotKey: "main_image", variant: "desktop", ext: "png" })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02_M01_image_DV.png");
  });

  it("emits _MV for a mobile single image", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 1, moduleType: "full_image", kind: "image", slotKey: "main_image", variant: "mobile", ext: "png" })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02_M01_image_MV.png");
  });

  it("emits hero/product tokens for comparison modules", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 4, moduleType: "comparison_table_1", kind: "image", slotKey: "hero_product", variant: "desktop", ext: "png" })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02_M04_hero_DV.png");
    expect(
      aplus2AssetFilename({ slug, modulePosition: 4, moduleType: "comparison_table_1", kind: "image", slotKey: "product_1", variant: "desktop", ext: "png" })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02_M04_product01_DV.png");
  });

  it("emits Slide## for carousel item images with variant suffix", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 9, moduleType: "simple_image_carousel", kind: "image", slotKey: "slide_image", itemPosition: 1, variant: "mobile", ext: "png" })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02_M09_Slide01_MV.png");
  });

  it("emits hotspot## for hotspot item images", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 8, moduleType: "hotspots_1", kind: "image", slotKey: "hotspot_image", itemPosition: 2, variant: "desktop", ext: "jpg" })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02_M08_hotspot02_DV.jpg");
  });

  it("emits a video file with no DV/MV suffix", () => {
    expect(
      aplus2AssetFilename({ slug, modulePosition: 12, moduleType: "full_video", kind: "video", slotKey: "video", variant: "desktop", ext: "mp4" })
    ).toBe("DRC_SC_US_B0DCLWMB4Y_APlus_V02_M12_video.mp4");
  });

  it("uses ABasic in BA+ asset filenames", () => {
    const baSlug = "BNU_SC_US_B0B39MGKRQ_ABasic_V01";
    expect(
      aplus2AssetFilename({
        slug: baSlug,
        modulePosition: 1,
        moduleType: "full_image",
        kind: "image",
        slotKey: "main_image",
        variant: "desktop",
        ext: "png",
      })
    ).toBe("BNU_SC_US_B0B39MGKRQ_ABasic_V01_M01_image_DV.png");
  });
});
