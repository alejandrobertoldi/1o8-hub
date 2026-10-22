import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock drive-client and db before importing the SUT.
vi.mock("@/lib/drive-client", () => ({
  driveClient: {
    createFolder: vi.fn(async (name: string, _parent: string) => ({
      id: `drive-${name}`,
      name,
      mimeType: "application/vnd.google-apps.folder",
    })),
  },
}));

const selectFromMock = vi.fn();
const insertIntoMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: selectFromMock }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: () => ({ returning: insertIntoMock }) }) }),
  },
}));

import { resolveUploadFolder } from "@/lib/drive-upload";

describe("resolveUploadFolder — brand_guidelines branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectFromMock.mockReset();
    insertIntoMock.mockReset();
  });

  it("creates 'Brand Guidelines' folder directly under client root when missing", async () => {
    // First select: typed folder lookup → not found
    selectFromMock.mockResolvedValueOnce([]);
    // Second select: client root lookup → found
    selectFromMock.mockResolvedValueOnce([
      { id: "db-root", driveFolderId: "drive-root", path: "/Clients/ACME" },
    ]);
    // Third select: existing-brand-guidelines path lookup → not found
    selectFromMock.mockResolvedValueOnce([]);
    // Insert returns the new row
    insertIntoMock.mockResolvedValueOnce([
      { id: "db-bg", driveFolderId: "drive-Brand Guidelines", path: "/Clients/ACME/Brand Guidelines" },
    ]);

    const result = await resolveUploadFolder({
      clientIdCode: "ACME",
      folderType: "brand_guidelines",
    });

    expect(result).toEqual({
      id: "db-bg",
      driveFolderId: "drive-Brand Guidelines",
    });

    const { driveClient } = await import("@/lib/drive-client");
    expect(driveClient.createFolder).toHaveBeenCalledWith("ACME_Brand Guidelines", "drive-root");
  });
});

import { resolveBrandGuidelinesArchiveFolder } from "@/lib/drive-upload";

describe("resolveBrandGuidelinesArchiveFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectFromMock.mockReset();
    insertIntoMock.mockReset();
  });

  it("creates Archive/ subfolder under existing Brand Guidelines/", async () => {
    // resolveUploadFolder → typed brand_guidelines folder found
    selectFromMock.mockResolvedValueOnce([
      { id: "db-bg", driveFolderId: "drive-bg", path: "/Clients/ACME/Brand Guidelines" },
    ]);
    // parentRow lookup
    selectFromMock.mockResolvedValueOnce([
      { path: "/Clients/ACME/Brand Guidelines" },
    ]);
    // existing archive lookup → not found
    selectFromMock.mockResolvedValueOnce([]);
    // insert returns the new row
    insertIntoMock.mockResolvedValueOnce([
      { id: "db-archive", driveFolderId: "drive-archive" },
    ]);

    const result = await resolveBrandGuidelinesArchiveFolder("ACME");
    expect(result).toEqual({ id: "db-archive", driveFolderId: "drive-archive" });

    const { driveClient } = await import("@/lib/drive-client");
    expect(driveClient.createFolder).toHaveBeenCalledWith("ACME_Brand Guidelines Archive", "drive-bg");
  });
});
