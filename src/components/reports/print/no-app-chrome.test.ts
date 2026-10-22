import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Guards the one hole LayoutRouter cannot close.
 *
 *  LayoutRouter returns bare children for /reports/*&#47;print, but it lives in the
 *  ROOT layout — every route-segment layout BELOW it still renders. So
 *  src/app/portal/layout.tsx injects its chrome into every portal print document
 *  no matter what LayoutRouter does. layout-router.test.tsx cannot catch this: it
 *  renders LayoutRouter directly against two vi.mock stubs, with no segment
 *  layouts in the tree at all.
 *
 *  The fix is that each component the portal layout renders carries .mf-no-print,
 *  which print.css defines. These assertions are the tripwire for that, including
 *  for the case where someone adds a THIRD component to the portal layout and
 *  does not think about print. */
const root = (p: string) => join(process.cwd(), p);

const PORTAL_LAYOUT = root("src/app/portal/layout.tsx");
const PRINT_CSS = root("src/components/reports/print/print.css");

/** Component render sites in the portal layout's JSX, e.g. `<AdminPreviewToggle />`.
 *  Lowercase tags (plain HTML) and fragments are not components. */
function componentsRenderedBy(file: string): string[] {
  const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const body = src.slice(src.indexOf("export default"));
  return [...new Set([...body.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g)].map((m) => m[1]))];
}

const CHROME_FILES: Record<string, string> = {
  AdminPreviewToggle: root("src/components/portal/admin-preview-toggle.tsx"),
  ProspectSampleBadge: root("src/components/portal/prospect-sample-badge.tsx"),
};

describe("portal print documents carry no app chrome", () => {
  it("print.css hides .mf-no-print in all media, not only when printing", () => {
    /* A print route IS a paper document, so the chrome must be gone on screen
       too. Scoping comes from print.css shipping only in the print routes' chunk. */
    const css = readFileSync(PRINT_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const beforeFirstMedia = css.slice(0, css.indexOf("@media"));
    expect(beforeFirstMedia).toMatch(/\.mf-no-print\s*\{[^}]*display:\s*none/);
  });

  it("knows every component the portal layout renders", () => {
    /* Fails when a component is ADDED to src/app/portal/layout.tsx, forcing an
       explicit decision about whether it may appear in a client's PDF. */
    expect(componentsRenderedBy(PORTAL_LAYOUT).sort()).toEqual(
      Object.keys(CHROME_FILES).sort(),
    );
  });

  it.each(Object.entries(CHROME_FILES))(
    "%s is marked mf-no-print so it stays out of the paper document",
    (_name, file) => {
      expect(readFileSync(file, "utf8")).toContain("mf-no-print");
    },
  );
});
