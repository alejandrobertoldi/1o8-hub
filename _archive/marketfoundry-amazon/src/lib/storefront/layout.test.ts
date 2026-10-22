import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STOREFRONT_FRAME_CLASS,
  STOREFRONT_GUTTER_GAP_CLASS,
  STOREFRONT_GUTTER_PX,
} from "./layout";

describe("Amazon storefront white frame", () => {
  it("uses a 12px gutter (gap-3 / p-3)", () => {
    expect(STOREFRONT_GUTTER_PX).toBe(12);
    expect(STOREFRONT_GUTTER_GAP_CLASS).toBe("gap-3");
    expect(STOREFRONT_FRAME_CLASS).toContain("p-3");
    expect(STOREFRONT_FRAME_CLASS).toContain("gap-3");
    expect(STOREFRONT_FRAME_CLASS).toContain("bg-white");
  });

  it("the Hub canvas and portal wrap modules in the white frame", () => {
    const hub = readFileSync(
      join(process.cwd(), "src/components/storefront/storefront-page-editor.tsx"),
      "utf8"
    );
    const portal = readFileSync(
      join(process.cwd(), "src/app/portal/design/storefront/page.tsx"),
      "utf8"
    );
    expect(hub).toMatch(/STOREFRONT_FRAME_CLASS/);
    expect(portal).toMatch(/STOREFRONT_FRAME_CLASS/);
  });

  it("split tiles in the canvas use the same gutter, not gap-0", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/storefront/storefront-module-preview.tsx"),
      "utf8"
    );
    expect(src).toMatch(/STOREFRONT_GUTTER_GAP_CLASS/);
    expect(src).not.toMatch(/gapClassName="gap-0"/);
    expect(src).toMatch(/isSingleRowSplit/);
    expect(src).toMatch(/object-cover/);
  });
});

describe("storefront version Drive folder", () => {
  it("the versions API exposes a Google Drive folder URL", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/api/storefront/[clientIdCode]/versions/route.ts"),
      "utf8"
    );
    expect(src).toMatch(/driveFolderUrl/);
    expect(src).toMatch(/drive\.google\.com\/drive\/folders/);
  });

  it("the editor links the selected version to its Drive folder", () => {
    const src = readFileSync(
      join(process.cwd(), "src/components/storefront/storefront-page-editor.tsx"),
      "utf8"
    );
    expect(src).toMatch(/activeDriveFolderUrl/);
    expect(src).toMatch(/Drive folder/);
  });
});
