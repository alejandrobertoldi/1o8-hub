import { describe, it, expect } from "vitest";
import {
  resolveClientFolderParent,
  PROSPECT_CLIENTS_FOLDER_ID,
  INACTIVE_CLIENTS_FOLDER_ID,
} from "./client-folder-routing";

const ROOT = "ROOT_DRIVE_ID";

describe("resolveClientFolderParent", () => {
  it("routes Prospect to the prospect folder", () => {
    expect(resolveClientFolderParent("Prospect", ROOT)).toBe(PROSPECT_CLIENTS_FOLDER_ID);
  });

  it("routes Inactive to the inactive folder", () => {
    expect(resolveClientFolderParent("Inactive", ROOT)).toBe(INACTIVE_CLIENTS_FOLDER_ID);
  });

  it("routes Active to the shared-drive root", () => {
    expect(resolveClientFolderParent("Active", ROOT)).toBe(ROOT);
  });

  it("routes unknown / blank / null / undefined to the shared-drive root", () => {
    expect(resolveClientFolderParent("Lead", ROOT)).toBe(ROOT);
    expect(resolveClientFolderParent("", ROOT)).toBe(ROOT);
    expect(resolveClientFolderParent(null, ROOT)).toBe(ROOT);
    expect(resolveClientFolderParent(undefined, ROOT)).toBe(ROOT);
  });

  it("is case-sensitive (lowercase 'prospect' falls through to root)", () => {
    expect(resolveClientFolderParent("prospect", ROOT)).toBe(ROOT);
  });

  it("exposes the exact production folder IDs", () => {
    expect(PROSPECT_CLIENTS_FOLDER_ID).toBe("1e-DTv3VlgOvT8WA9rGoP_WV0ZtTzvkT7");
    expect(INACTIVE_CLIENTS_FOLDER_ID).toBe("1NTvrc3buwtsL2_E9ACkX4dFY-0o1SelT");
  });
});
