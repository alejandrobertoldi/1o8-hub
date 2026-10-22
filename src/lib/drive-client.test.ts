import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/lib/gcp-auth", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

import { driveClient, DRIVE_THUMBNAIL_FALLBACK_MAX_BYTES } from "./drive-client";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn() as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe("driveClient.setAnyoneLinkWriter", () => {
  it("POSTs a writer permission with type=anyone", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ id: "perm-1" }), { status: 200 })
    );

    await driveClient.setAnyoneLinkWriter("file-abc");

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/drive/v3/files/file-abc/permissions?supportsAllDrives=true"
    );
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      role: "writer",
      type: "anyone",
      allowFileDiscovery: false,
    });
  });
});

describe("driveClient.getThumbnail", () => {
  it("resizes Drive's thumbnailLink to the requested edge length", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff]);
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            thumbnailLink: "https://lh3.googleusercontent.com/d/abc=s220",
            mimeType: "image/png",
            size: "8000000",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg" } })
      );

    const result = await driveClient.getThumbnail("file-abc", 1600);

    expect(result.contentType).toBe("image/jpeg");
    expect(result.bytes.equals(Buffer.from(jpeg))).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe("https://lh3.googleusercontent.com/d/abc=s1600");
  });

  it("asks Drive for a JPEG (-rj) when forceJpeg is set, so a PNG source never comes back as a lossless PNG", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ thumbnailLink: "https://lh3.googleusercontent.com/d/abc=s220", mimeType: "image/png", size: "3000000" }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200, headers: { "content-type": "image/jpeg" } }));

    const result = await driveClient.getThumbnail("file-abc", 1600, { forceJpeg: true });

    expect(fetchMock.mock.calls[1][0]).toBe("https://lh3.googleusercontent.com/d/abc=s1600-rj");
    expect(result.contentType).toBe("image/jpeg");
  });

  it("does not download an original larger than the Vercel response cap", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          mimeType: "image/png",
          size: String(DRIVE_THUMBNAIL_FALLBACK_MAX_BYTES + 1),
        }),
        { status: 200 }
      )
    );

    await expect(driveClient.getThumbnail("huge-png")).rejects.toThrow(
      "No thumbnail available for huge-png"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the original when it fits in a Vercel response", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mimeType: "image/png", size: "120000" }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(png, { status: 200 }));

    const result = await driveClient.getThumbnail("small-png");

    expect(result.contentType).toBe("image/png");
    expect(result.bytes.equals(Buffer.from(png))).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain("alt=media");
  });
});
