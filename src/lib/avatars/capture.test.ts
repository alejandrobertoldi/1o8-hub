// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { captureUserAvatar, isOrgEmail, type CaptureDeps } from "./capture";

function deps(photo: { bytes: Buffer; contentType: string } | null): CaptureDeps {
  return {
    getDirectoryPhoto: vi.fn().mockResolvedValue(photo),
    uploadAvatar: vi.fn().mockResolvedValue("https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=1"),
  };
}
const PHOTO = { bytes: Buffer.from([1, 2, 3]), contentType: "image/png" };

describe("isOrgEmail", () => {
  it("matches the org domain case-insensitively and nothing else", () => {
    expect(isOrgEmail("Jane@MarketFoundry.Agency")).toBe(true);
    expect(isOrgEmail("jane@1o8.agency")).toBe(false);
    expect(isOrgEmail("jane@marketfoundry.agency.evil.com")).toBe(false);
  });
});

describe("captureUserAvatar", () => {
  it("skips non-org emails without calling the directory", async () => {
    const d = deps(PHOTO);
    expect(await captureUserAvatar({ id: "u-1", email: "c@client.com" }, {}, d)).toEqual({ status: "skipped", reason: "non-org-email" });
    expect(d.getDirectoryPhoto).not.toHaveBeenCalled();
  });

  it("returns no-photo when the directory has none, without uploading", async () => {
    const d = deps(null);
    expect(await captureUserAvatar({ id: "u-1", email: "j@marketfoundry.agency" }, {}, d)).toEqual({ status: "no-photo" });
    expect(d.uploadAvatar).not.toHaveBeenCalled();
  });

  it("uploads and returns the stored URL", async () => {
    const d = deps(PHOTO);
    const r = await captureUserAvatar({ id: "u-1", email: "j@marketfoundry.agency" }, {}, d);
    expect(r).toEqual({ status: "stored", url: "https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=1" });
    expect(d.uploadAvatar).toHaveBeenCalledWith("u-1", PHOTO.bytes, "image/png");
  });

  it("dry-run fetches the photo but never uploads", async () => {
    const d = deps(PHOTO);
    const r = await captureUserAvatar({ id: "u-1", email: "j@marketfoundry.agency" }, { dryRun: true }, d);
    expect(r).toEqual({ status: "would-store", contentType: "image/png", byteLength: 3 });
    expect(d.uploadAvatar).not.toHaveBeenCalled();
  });
});
