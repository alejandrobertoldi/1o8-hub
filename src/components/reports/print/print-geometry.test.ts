import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Tripwire for the plan's load-bearing paper-geometry invariant.
 *
 *  `print-document.test.tsx` can only assert that the `.mf-paper` CLASS is
 *  applied — jsdom does not compute stylesheets, so no rendering test can catch
 *  a media-dependent width. That leaves the single most dangerous regression in
 *  this feature uncovered: wrapping `.mf-paper`'s width in `@media print`, or
 *  setting it to `auto`, silently reintroduces the chart-sizing bug the whole
 *  print layer exists to fix (Recharts' ResponsiveContainer measures its parent
 *  once, on screen, and never re-measures for the print page box).
 *
 *  So this is a source-scan guard instead. Comments are stripped first: this
 *  file's own explanatory comments in print.css legitimately contain the strings
 *  "width: auto" and "@media print", and a naive grep would flag them. */
const CSS_PATH = join(process.cwd(), "src/components/reports/print/print.css");

function css(): string {
  return readFileSync(CSS_PATH, "utf8");
}

function withoutComments(): string {
  return css().replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("print.css paper geometry", () => {
  it("sets the canvas to the printable width of A4 landscape at 14mm/18mm margins", () => {
    // 297mm − 2×18mm = 261mm. Changing one without the other breaks the fit.
    expect(withoutComments()).toMatch(/\.mf-paper\s*\{[^}]*\bwidth:\s*261mm\b/);
  });

  it("declares the A4 landscape page box with the monthly report's margins", () => {
    const src = withoutComments();
    expect(src).toMatch(/@page\s*\{[^}]*\bsize:\s*A4 landscape\b/);
    expect(src).toMatch(/@page\s*\{[^}]*\bmargin:\s*14mm 18mm\b/);
  });

  it("isolates the page box in a named context so stylesheet order cannot change it", () => {
    /* globals.css:589-592 declares a competing `@page { size: landscape;
       margin: 12mm }` that an @page rule cannot have scoped by a selector.
       Measured in Chrome: with only an unnamed rule, whichever sheet loads last
       wins, and the legacy one yields a 255.4mm content box on a US-Letter
       default — clipping ~6mm per page off a 261mm canvas. */
    const src = withoutComments();
    expect(src).toMatch(/@page\s+mfpaper\s*\{[^}]*\bsize:\s*A4 landscape\b/);
    expect(src).toMatch(/\.mf-paper\s*\{[^}]*\bpage:\s*mfpaper\b/);
  });

  it("never makes the canvas width media-dependent", () => {
    const src = withoutComments();
    // Keep the scan honest: the simple "everything after the first @media"
    // check below is only sound while there is exactly one @media block.
    expect((src.match(/@media/g) ?? []).length).toBe(1);

    const afterFirstMedia = src.slice(src.indexOf("@media"));
    expect(afterFirstMedia).not.toMatch(/\.mf-paper[^{]*\{[^}]*\bwidth\b/);
  });

  it("never widens the canvas to auto anywhere", () => {
    expect(withoutComments()).not.toMatch(/\.mf-paper[^{]*\{[^}]*\bwidth:\s*auto\b/);
  });
});
