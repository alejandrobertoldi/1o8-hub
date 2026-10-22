import { describe, expect, it } from "vitest";
import {
  nextUnusedVersion,
  getExt,
  sanitizeFileName,
  listingImageMasterSubfolderName,
} from "./listing-image-upload";

describe("nextUnusedVersion", () => {
  it("starts at 1 for a slot with no versions", () => {
    expect(nextUnusedVersion([])).toBe(1);
  });

  it("returns the next number for a contiguous run", () => {
    expect(nextUnusedVersion([1])).toBe(2);
    expect(nextUnusedVersion([1, 2, 3])).toBe(4);
  });

  it("reuses a number freed by a delete so the Drive folder stays gap-free", () => {
    // V02 was deleted; the next upload takes V02 again, not V04.
    expect(nextUnusedVersion([1, 3])).toBe(2);
  });

  it("ignores ordering", () => {
    expect(nextUnusedVersion([3, 1, 4])).toBe(2);
  });
});

describe("getExt", () => {
  it("normalises both jpeg spellings to jpg", () => {
    expect(getExt("image/jpeg")).toBe("jpg");
    expect(getExt("image/jpg")).toBe("jpg");
  });

  it("handles the slot image types Design uses", () => {
    expect(getExt("image/png")).toBe("png");
    expect(getExt("image/webp")).toBe("webp");
    expect(getExt("image/gif")).toBe("gif");
    expect(getExt("image/svg+xml")).toBe("svg");
  });

  it("is case-insensitive", () => {
    expect(getExt("IMAGE/PNG")).toBe("png");
  });

  it("falls back to the subtype, then bin", () => {
    expect(getExt("application/postscript")).toBe("postscript");
    expect(getExt("nonsense")).toBe("bin");
  });
});

describe("sanitizeFileName", () => {
  it("replaces characters Drive and the filename convention cannot carry", () => {
    expect(sanitizeFileName("a/b\\c:d*e?f\"g<h>i|j")).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeFileName("  Poochie Butter  ")).toBe("Poochie Butter");
  });

  it("leaves a clean ASIN untouched", () => {
    expect(sanitizeFileName("B0GF1QGP4C")).toBe("B0GF1QGP4C");
  });
});

describe("listingImageMasterSubfolderName", () => {
  it("appends _Master_Files to the variation folder name", () => {
    expect(listingImageMasterSubfolderName("ELK_SC_US_01_Creatine Gummies")).toBe(
      "ELK_SC_US_01_Creatine Gummies_Master_Files"
    );
  });
});
