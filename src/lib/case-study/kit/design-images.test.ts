// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => exec(...a) } }));
vi.mock("../aplus-screenviews", () => ({
  resolveAplusScreenviews: vi.fn().mockResolvedValue({
    screenviews: [{ asin: "B1", contentType: "PA+", images: ["/a1", "/a2"] }, { asin: "B2", contentType: "BA+", images: ["/b1"] }],
    hasBasic: true, hasPremium: true }),
}));
import { resolveDesignImages, pickVersion } from "./design-images";

const text = (q: unknown) => JSON.stringify(q);
beforeEach(() => {
  exec.mockReset();
  exec.mockImplementation((q: unknown) => {
    const s = text(q);
    if (s.includes("listing_image_slot_versions")) return Promise.resolve([
      { slot: "PT01", version_number: 2, status: "live", gid: "g-pt01-v2" },
      { slot: "PT01", version_number: 3, status: "in_review", gid: "g-pt01-v3" },
      { slot: "MAIN", version_number: 1, status: "approved", gid: "g-main" },
      { slot: "PT02", version_number: 1, status: "discontinued", gid: "g-pt02" },
    ]);
    if (s.includes("brand_story_versions")) return Promise.resolve([
      { version_id: "v1", version_number: 1, status: "live", gid: "g-bs1" },
      { version_id: "v2", version_number: 2, status: "in_progress", gid: "g-bs2" },
    ]);
    if (s.includes("storefront_versions")) return Promise.resolve([
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-home", is_homepage: true, page_pos: 1, mod_pos: 1, tile_pos: null, gid: "g-hero", mime: "image/jpeg" },
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-home", is_homepage: true, page_pos: 1, mod_pos: 2, tile_pos: 1, gid: "g-tile", mime: "image/png" },
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-home", is_homepage: true, page_pos: 1, mod_pos: 3, tile_pos: null, gid: "g-vid", mime: "video/mp4" },
      { version_id: "sv1", version_number: 1, status: "approved", page_id: "p-2", is_homepage: false, page_pos: 2, mod_pos: 1, tile_pos: null, gid: "g-p2", mime: "image/jpeg" },
    ]);
    if (s.includes("client_logo_url")) return Promise.resolve([{ url: "https://logo" }]);
    if (s.includes("aplus2_modules")) return Promise.resolve([{ premium_modules: 7, asins_live: 4 }]);
    return Promise.resolve([]);
  });
});

describe("pickVersion", () => {
  it("live > approved > in_review > rest; discontinued excluded; tie → higher version", () => {
    expect(pickVersion([{ status: "in_review", versionNumber: 9 }, { status: "live", versionNumber: 1 }])?.versionNumber).toBe(1);
    expect(pickVersion([{ status: "discontinued", versionNumber: 5 }])).toBeUndefined();
    expect(pickVersion([{ status: "in_progress", versionNumber: 1 }, { status: "in_progress", versionNumber: 2 }])?.versionNumber).toBe(2);
  });
});

describe("resolveDesignImages", () => {
  it("builds every image group from Design", async () => {
    const d = await resolveDesignImages("REA_SC_US", "B1");
    expect(d.heroListing).toEqual([
      "/api/design/listing-images/image?driveFileId=g-main",
      "/api/design/listing-images/image?driveFileId=g-pt01-v2",
    ]);
    expect(d.brandStory).toEqual(["/api/design-status/brand-story-image?driveFileId=g-bs1"]);
    expect(d.aplusStacks).toEqual([["/a1", "/a2"], ["/b1"]]);
    expect(d.storefrontPages).toEqual([
      ["/api/storefront/image?driveFileId=g-hero", "/api/storefront/image?driveFileId=g-tile"],
      ["/api/storefront/image?driveFileId=g-p2"],
    ]);
    expect(d.logo).toEqual(["https://logo"]);
    expect(d.aplusPremiumModules).toBe(7);
    expect(d.aplusAsinsLive).toBe(4);
  });
  it("no hero ASIN → empty listing, other groups still resolve", async () => {
    const d = await resolveDesignImages("REA_SC_US", null);
    expect(d.heroListing).toEqual([]);
    expect(d.brandStory.length).toBe(1);
  });
  it("a failing group yields empty for that group only", async () => {
    exec.mockImplementation((q: unknown) => text(q).includes("brand_story_versions") ? Promise.reject(new Error("x")) : Promise.resolve([]));
    const d = await resolveDesignImages("REA_SC_US", "B1");
    expect(d.brandStory).toEqual([]);
    expect(d.aplusStacks.length).toBe(2);
  });
});
