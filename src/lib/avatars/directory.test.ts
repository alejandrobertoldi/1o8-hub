// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { photosGet, JWT } = vi.hoisted(() => ({
  photosGet: vi.fn(),
  JWT: vi.fn(function (this: Record<string, unknown>, opts: unknown) {
    this.opts = opts;
  }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT },
    admin: vi.fn(() => ({ users: { photos: { get: photosGet } } })),
  },
}));

import { getDirectoryPhoto, decodeWebSafeBase64, DIRECTORY_PHOTO_SCOPE } from "./directory";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GCP_CLIENT_EMAIL = "sa@proj.iam.gserviceaccount.com";
  process.env.GCP_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----";
  process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL = "admin@marketfoundry.agency";
});

describe("decodeWebSafeBase64", () => {
  it("decodes Google's web-safe variant (- _ and * padding)", () => {
    // standard base64 of bytes [0xfb, 0xff] is "+/8=" → web-safe "-_8*"
    expect([...decodeWebSafeBase64("-_8*")]).toEqual([0xfb, 0xff]);
  });
});

describe("getDirectoryPhoto", () => {
  it("impersonates the admin with the directory scope and returns decoded bytes", async () => {
    photosGet.mockResolvedValue({ data: { photoData: "-_8*", mimeType: "image/png" } });
    const r = await getDirectoryPhoto("jane@marketfoundry.agency");
    expect(r).toEqual({ bytes: Buffer.from([0xfb, 0xff]), contentType: "image/png" });
    expect(photosGet).toHaveBeenCalledWith({ userKey: "jane@marketfoundry.agency" });
    const opts = JWT.mock.calls[0][0] as { subject: string; scopes: string[]; key: string };
    expect(opts.subject).toBe("admin@marketfoundry.agency");
    expect(opts.scopes).toEqual([DIRECTORY_PHOTO_SCOPE]);
    expect(opts.key).toContain("\nabc\n");
  });

  it("returns null on 404 (no photo / not in directory)", async () => {
    photosGet.mockRejectedValue(Object.assign(new Error("Not Found"), { code: 404 }));
    expect(await getDirectoryPhoto("x@marketfoundry.agency")).toBeNull();
  });

  it("returns null when the response has no photoData", async () => {
    photosGet.mockResolvedValue({ data: {} });
    expect(await getDirectoryPhoto("x@marketfoundry.agency")).toBeNull();
  });

  it("rethrows non-404 errors", async () => {
    photosGet.mockRejectedValue(Object.assign(new Error("Forbidden"), { code: 403 }));
    await expect(getDirectoryPhoto("x@marketfoundry.agency")).rejects.toThrow("Forbidden");
  });

  it("throws a clear error when env is missing", async () => {
    delete process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
    await expect(getDirectoryPhoto("x@marketfoundry.agency")).rejects.toThrow(/GOOGLE_WORKSPACE_ADMIN_EMAIL/);
  });
});
