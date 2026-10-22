import { describe, it, expect, vi, beforeEach } from "vitest";

const drive = vi.hoisted(() => ({
  findChildFolder: vi.fn(),
  createFolder: vi.fn(),
  listFiles: vi.fn(),
  downloadFileContent: vi.fn(),
}));

vi.mock("@/lib/drive-client", () => ({
  driveClient: drive,
  sharedDriveId: () => "SHARED",
}));

import {
  parseLogoRequest,
  pickLogoFile,
  resolveLogosFolderId,
  fetchClientLogo,
  __resetLogosFolderCache,
  BACKEND_FOLDER_NAME,
  LOGOS_FOLDER_NAME,
} from "./drive-logos";

const f = (name: string, mimeType = "image/png", createdTime = "2026-01-01T00:00:00Z") => ({
  id: `id-${name}-${createdTime}`,
  name,
  mimeType,
  createdTime,
});

beforeEach(() => {
  vi.resetAllMocks();
  __resetLogosFolderCache();
});

describe("parseLogoRequest", () => {
  it("accepts {CODE}.png and upper-cases the code", () => {
    expect(parseLogoRequest("REA_SC_US.png")).toBe("REA_SC_US");
    expect(parseLogoRequest("rea_sc_us.png")).toBe("REA_SC_US");
  });
  it("rejects anything that could escape a Drive query or a path", () => {
    for (const bad of ["REA'.png", "../x.png", "REA_SC_US.jpg", "REA_SC_US", ".png", "a b.png"]) {
      expect(parseLogoRequest(bad)).toBeNull();
    }
  });
});

describe("pickLogoFile", () => {
  it("matches the exact code only, not a code that merely starts with it", () => {
    const files = [f("REA_SC_US_old.png"), f("XREA_SC_US.png"), f("REA_SC_US.png")];
    expect(pickLogoFile(files, "REA_SC_US")?.name).toBe("REA_SC_US.png");
  });
  it("prefers PNG over other image types, then the newest upload", () => {
    const files = [
      f("REA_SC_US.jpg", "image/jpeg", "2026-09-01T00:00:00Z"),
      f("REA_SC_US.png", "image/png", "2026-01-01T00:00:00Z"),
      f("REA_SC_US.png", "image/png", "2026-05-01T00:00:00Z"),
    ];
    const pick = pickLogoFile(files, "REA_SC_US");
    expect(pick?.mimeType).toBe("image/png");
    expect(pick?.createdTime).toBe("2026-05-01T00:00:00Z");
  });
  it("ignores non-image files such as a .psd", () => {
    expect(pickLogoFile([f("REA_SC_US.psd", "image/vnd.adobe.photoshop")], "REA_SC_US")).toBeNull();
  });
});

describe("resolveLogosFolderId", () => {
  it("creates both folders when neither exists", async () => {
    drive.findChildFolder.mockResolvedValue(null);
    drive.createFolder
      .mockResolvedValueOnce({ id: "BACKEND" })
      .mockResolvedValueOnce({ id: "LOGOS" });
    await expect(resolveLogosFolderId()).resolves.toBe("LOGOS");
    expect(drive.createFolder).toHaveBeenNthCalledWith(1, BACKEND_FOLDER_NAME, "SHARED");
    expect(drive.createFolder).toHaveBeenNthCalledWith(2, LOGOS_FOLDER_NAME, "BACKEND");
  });
  it("reuses existing folders and memoises the result", async () => {
    drive.findChildFolder
      .mockResolvedValueOnce({ id: "BACKEND" })
      .mockResolvedValueOnce({ id: "LOGOS" });
    await resolveLogosFolderId();
    await expect(resolveLogosFolderId()).resolves.toBe("LOGOS");
    expect(drive.createFolder).not.toHaveBeenCalled();
    expect(drive.findChildFolder).toHaveBeenCalledTimes(2);
  });
  it("does not memoise a failure", async () => {
    drive.findChildFolder.mockRejectedValueOnce(new Error("drive down"));
    await expect(resolveLogosFolderId()).rejects.toThrow("drive down");
    drive.findChildFolder.mockResolvedValue({ id: "X" });
    await expect(resolveLogosFolderId()).resolves.toBe("X");
  });
});

describe("fetchClientLogo", () => {
  beforeEach(() => drive.findChildFolder.mockResolvedValue({ id: "LOGOS" }));

  it("pages through the folder and downloads the matching file", async () => {
    drive.listFiles
      .mockResolvedValueOnce({ files: [f("AAA_SC_US.png")], nextPageToken: "p2" })
      .mockResolvedValueOnce({ files: [f("REA_SC_US.png")] });
    drive.downloadFileContent.mockResolvedValue(Buffer.from("png-bytes"));
    const logo = await fetchClientLogo("REA_SC_US");
    expect(logo?.mimeType).toBe("image/png");
    expect(logo?.bytes.toString()).toBe("png-bytes");
    expect(drive.listFiles).toHaveBeenLastCalledWith("'LOGOS' in parents", "p2");
  });
  it("returns null when the folder has no logo for the code", async () => {
    drive.listFiles.mockResolvedValue({ files: [f("AAA_SC_US.png")] });
    await expect(fetchClientLogo("REA_SC_US")).resolves.toBeNull();
    expect(drive.downloadFileContent).not.toHaveBeenCalled();
  });
});

describe("listClientLogoCodes", () => {
  it("indexes servable images by upper-cased code and skips non-images", async () => {
    const { listClientLogoCodes } = await import("./drive-logos");
    drive.findChildFolder.mockResolvedValue({ id: "LOGOS" });
    drive.listFiles.mockResolvedValue({
      files: [f("REA_SC_US.png"), f("bnu_sc_us.webp", "image/webp"), f("TRT_SC_US.psd", "image/vnd.adobe.photoshop"), f("notes.txt", "text/plain")],
    });
    expect([...(await listClientLogoCodes())].sort()).toEqual(["BNU_SC_US", "REA_SC_US"]);
  });
});
