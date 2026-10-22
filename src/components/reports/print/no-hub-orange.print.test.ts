import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The existing guard (src/components/reports/v2/no-hub-orange.test.ts) reads
 *  only the v2 directory, non-recursively, so nothing covered the print layer.
 *  The print layer renders on BOTH surfaces from the same components, which is
 *  exactly where a hardcoded hub orange would leak onto a client's PDF. */
const PRINT_DIR = join(process.cwd(), "src/components/reports/print");

function printFiles(): string[] {
  return readdirSync(PRINT_DIR).filter(
    (f) => (f.endsWith(".tsx") || f.endsWith(".ts") || f.endsWith(".css")) && !f.includes(".test."),
  );
}

describe("the print layer and the dual-accent rule", () => {
  it("scans a plausible number of print-layer files", () => {
    // Four as of this task (print-sections.ts, print-url.ts, print.css,
    // print-document.tsx) and nine once the layer is complete. The only job of
    // this assertion is to fail loudly if the glob ever matches nothing.
    expect(printFiles().length).toBeGreaterThanOrEqual(4);
  });

  it.each(printFiles())("%s contains no hardcoded hub orange", (file) => {
    expect(readFileSync(join(PRINT_DIR, file), "utf8").toLowerCase()).not.toContain("ff751f");
  });

  it.each(printFiles())("%s never inlines a bare text-brand class", (file) => {
    expect(readFileSync(join(PRINT_DIR, file), "utf8")).not.toContain("text-brand");
  });

  /* The hex and class checks above are inherited from the v2 guard, but neither
     can catch this layer's realistic leak. Nothing here writes a raw hex — the
     accent arrives as a TOKEN, so a leak looks like `var(--mf-orange)` or
     `bg-mf-orange` written directly instead of taking `palette.accent` from
     getSurfacePalette(surface). These files render on BOTH surfaces from the
     same components, so a hardcoded token would put hub orange on a client's PDF. */
  it.each(printFiles())("%s takes its accent from the palette, not a hub token", (file) => {
    const src = readFileSync(join(PRINT_DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toContain("--mf-orange");
    expect(src).not.toContain("mf-orange");
  });
});
