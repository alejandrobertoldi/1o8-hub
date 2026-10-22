// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { uploadAvatar, avatarExtension } from "./storage";
import { isStoredAvatarUrl } from "./url";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.SUPABASE_URL = "https://proj.supabase.co/";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});
afterEach(() => vi.unstubAllGlobals());

describe("avatarExtension", () => {
  it("maps known image types and rejects others", () => {
    expect(avatarExtension("image/jpeg")).toBe("jpg");
    expect(avatarExtension("image/png")).toBe("png");
    expect(avatarExtension("image/webp")).toBe("webp");
    expect(() => avatarExtension("text/html")).toThrow(/Unsupported avatar content type/);
  });
});

describe("uploadAvatar", () => {
  it("upserts {userId}.{ext} with the service key and returns the versioned public URL", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const bytes = Buffer.from([1, 2, 3]);
    const v = createHash("sha256").update(bytes).digest("hex").slice(0, 10);

    const url = await uploadAvatar("u-1", bytes, "image/png");

    expect(url).toBe(`https://proj.supabase.co/storage/v1/object/public/avatars/u-1.png?v=${v}`);
    expect(isStoredAvatarUrl(url)).toBe(true);
    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toBe("https://proj.supabase.co/storage/v1/object/avatars/u-1.png");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer service-key");
    expect(h["x-upsert"]).toBe("true");
    expect(h["Content-Type"]).toBe("image/png");
  });

  it("throws with status on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("bucket not found", { status: 404 }));
    await expect(uploadAvatar("u-1", Buffer.from([1]), "image/jpeg")).rejects.toThrow(/404.*bucket not found/);
  });

  it("throws a clear error when env is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await expect(uploadAvatar("u-1", Buffer.from([1]), "image/jpeg")).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});
