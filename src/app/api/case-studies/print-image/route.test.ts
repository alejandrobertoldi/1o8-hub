// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
const getThumbnail = vi.fn();
vi.mock("@/lib/drive-client", () => ({ driveClient: { getThumbnail: (...a: unknown[]) => getThumbnail(...a) } }));

import { getAuthSession } from "@/lib/auth-db";
import { GET } from "./route";

const session = getAuthSession as unknown as ReturnType<typeof vi.fn>;
const req = (qs: string) => new NextRequest(`http://localhost/api/case-studies/print-image${qs}`);

beforeEach(() => {
  vi.clearAllMocks();
  session.mockResolvedValue({ user: { role: "editor" } });
  getThumbnail.mockResolvedValue({ bytes: Buffer.from([0xff, 0xd8, 0xff]), contentType: "image/jpeg" });
});

describe("GET /api/case-studies/print-image", () => {
  it("401 without a session", async () => {
    session.mockResolvedValue(null);
    expect((await GET(req("?driveFileId=abc"))).status).toBe(401);
    expect(getThumbnail).not.toHaveBeenCalled();
  });

  it("403 for non-staff roles (client, pending)", async () => {
    for (const role of ["client", "pending"]) {
      session.mockResolvedValue({ user: { role } });
      expect((await GET(req("?driveFileId=abc"))).status).toBe(403);
    }
    expect(getThumbnail).not.toHaveBeenCalled();
  });

  it("400 on a missing or invalid driveFileId", async () => {
    for (const qs of ["", "?driveFileId=", "?driveFileId=a%2Fb", "?driveFileId=a.b", "?driveFileId=a%20b"]) {
      expect((await GET(req(qs))).status).toBe(400);
    }
    expect(getThumbnail).not.toHaveBeenCalled();
  });

  it("returns the Drive thumbnail at 1600px by default with its content type and a long cache", async () => {
    const res = await GET(req("?driveFileId=Ab_c-9"));
    expect(res.status).toBe(200);
    expect(getThumbnail).toHaveBeenCalledWith("Ab_c-9", 1600, { forceJpeg: true });
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  it("clamps w to 400–2000 and falls back to 1600 on junk", async () => {
    const cases: [string, number][] = [["100", 400], ["5000", 2000], ["800", 800], ["abc", 1600], ["1234.6", 1235]];
    for (const [w, expected] of cases) {
      getThumbnail.mockClear();
      await GET(req(`?driveFileId=abc&w=${w}`));
      expect(getThumbnail).toHaveBeenCalledWith("abc", expected, { forceJpeg: true });
    }
  });

  it("500 when Drive fails", async () => {
    getThumbnail.mockRejectedValue(new Error("drive down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(req("?driveFileId=abc"))).status).toBe(500);
  });
});
